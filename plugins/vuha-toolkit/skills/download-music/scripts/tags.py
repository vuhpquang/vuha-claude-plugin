# /// script
# requires-python = ">=3.10"
# dependencies = ["mutagen>=1.47"]
# ///
"""Read, look up and write the tags of a downloaded song.

Run with uv so mutagen comes along:  uv run -q <this file> <command> ...

  show   <file>                  print title/artist/album/... and whether a cover is embedded
  lookup <query> [--limit N]     search the iTunes catalogue (no key needed); prints JSON candidates
                                 with title, artist, album, album_artist, year, genre, track, cover URL
  write  <file> [--title T] [--artist A] [--album AL] [--album-artist AA] [--year Y]
                [--genre G] [--track N] [--cover URL_OR_PATH]
                                 set only the fields given; --cover replaces the embedded artwork

Handles .m4a/.mp4, .mp3, .flac and .ogg/.opus.
"""
import argparse
import base64
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import mutagen
from mutagen.flac import FLAC, Picture
from mutagen.id3 import APIC, ID3, TALB, TCON, TDRC, TIT2, TPE1, TPE2, TRCK, ID3NoHeaderError
from mutagen.mp4 import MP4, MP4Cover

FIELDS = ("title", "artist", "album", "album_artist", "year", "genre", "track")
MP4_KEYS = {"title": "\xa9nam", "artist": "\xa9ART", "album": "\xa9alb", "album_artist": "aART",
            "year": "\xa9day", "genre": "\xa9gen"}
ID3_FRAMES = {"title": ("TIT2", TIT2), "artist": ("TPE1", TPE1), "album": ("TALB", TALB),
              "album_artist": ("TPE2", TPE2), "year": ("TDRC", TDRC), "genre": ("TCON", TCON),
              "track": ("TRCK", TRCK)}
VORBIS_KEYS = {"title": "title", "artist": "artist", "album": "album", "album_artist": "albumartist",
               "year": "date", "genre": "genre", "track": "tracknumber"}


def kind(path):
    ext = Path(path).suffix.lower()
    if ext in (".m4a", ".mp4", ".aac", ".alac"):
        return "mp4"
    if ext == ".mp3":
        return "mp3"
    if ext == ".flac":
        return "flac"
    if ext in (".ogg", ".opus"):
        return "ogg"
    sys.exit(f"unsupported file type: {ext}")


def show(path):
    k = kind(path)
    out = {f: None for f in FIELDS}
    cover = False
    if k == "mp4":
        t = MP4(path).tags or {}
        for f, key in MP4_KEYS.items():
            if key in t:
                out[f] = str(t[key][0])
        if "trkn" in t:
            out["track"] = str(t["trkn"][0][0])
        cover = bool(t.get("covr"))
    elif k == "mp3":
        try:
            t = ID3(path)
        except ID3NoHeaderError:
            t = {}
        for f, (frame, _) in ID3_FRAMES.items():
            if frame in t:
                out[f] = str(t[frame].text[0])
        cover = any(key.startswith("APIC") for key in t.keys())
    else:
        a = mutagen.File(path)
        t = a.tags or {}
        for f, key in VORBIS_KEYS.items():
            if key in t:
                out[f] = t[key][0]
        cover = bool(getattr(a, "pictures", None)) or "metadata_block_picture" in t
    info = mutagen.File(path).info
    out["cover"] = cover
    out["duration_s"] = round(info.length)
    out["bitrate_kbps"] = round(getattr(info, "bitrate", 0) / 1000) or None
    out["sample_rate"] = getattr(info, "sample_rate", None)
    out["bits"] = getattr(info, "bits_per_sample", None)
    print(json.dumps(out, ensure_ascii=False, indent=2))


def lookup(query, limit):
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": query, "entity": "song", "limit": limit})
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    rows = []
    for x in data.get("results", []):
        rows.append({
            "title": x.get("trackName"),
            "artist": x.get("artistName"),
            "album": x.get("collectionName"),
            "album_artist": x.get("collectionArtistName") or x.get("artistName"),
            "year": (x.get("releaseDate") or "")[:4] or None,
            "genre": x.get("primaryGenreName"),
            "track": x.get("trackNumber"),
            "duration_s": round(x.get("trackTimeMillis", 0) / 1000) or None,
            "cover": (x.get("artworkUrl100") or "").replace("100x100bb", "1200x1200bb") or None,
        })
    print(json.dumps(rows, ensure_ascii=False, indent=2))


def load_cover(src):
    if src.startswith(("http://", "https://")):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    else:
        data = Path(src).expanduser().read_bytes()
    png = data[:8] == b"\x89PNG\r\n\x1a\n"
    return data, png


def write(args):
    path = args.file
    k = kind(path)
    vals = {f: getattr(args, f) for f in FIELDS if getattr(args, f) is not None}
    cover = load_cover(args.cover) if args.cover else None
    if k == "mp4":
        a = MP4(path)
        if a.tags is None:
            a.add_tags()
        for f, v in vals.items():
            if f == "track":
                a.tags["trkn"] = [(int(v), 0)]
            else:
                a.tags[MP4_KEYS[f]] = [v]
        if cover:
            data, png = cover
            a.tags["covr"] = [MP4Cover(data, MP4Cover.FORMAT_PNG if png else MP4Cover.FORMAT_JPEG)]
        a.save()
    elif k == "mp3":
        try:
            t = ID3(path)
        except ID3NoHeaderError:
            t = ID3()
        for f, v in vals.items():
            frame, cls = ID3_FRAMES[f]
            t.setall(frame, [cls(encoding=3, text=[str(v)])])
        if cover:
            data, png = cover
            t.delall("APIC")
            t.add(APIC(encoding=3, mime="image/png" if png else "image/jpeg", type=3, desc="Cover", data=data))
        t.save(path, v2_version=3)
    else:
        a = mutagen.File(path)
        if a.tags is None:
            a.add_tags()
        for f, v in vals.items():
            a.tags[VORBIS_KEYS[f]] = [str(v)]
        if cover:
            data, png = cover
            pic = Picture()
            pic.type, pic.mime, pic.desc, pic.data = 3, "image/png" if png else "image/jpeg", "Cover", data
            if isinstance(a, FLAC):
                a.clear_pictures()
                a.add_picture(pic)
            else:
                a.tags["metadata_block_picture"] = [base64.b64encode(pic.write()).decode()]
        a.save()
    show(path)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show").add_argument("file")
    lk = sub.add_parser("lookup")
    lk.add_argument("query")
    lk.add_argument("--limit", type=int, default=5)
    w = sub.add_parser("write")
    w.add_argument("file")
    for f in FIELDS:
        w.add_argument("--" + f.replace("_", "-"), dest=f)
    w.add_argument("--cover")
    a = p.parse_args()
    if a.cmd == "show":
        show(a.file)
    elif a.cmd == "lookup":
        lookup(a.query, a.limit)
    else:
        write(a)


if __name__ == "__main__":
    main()
