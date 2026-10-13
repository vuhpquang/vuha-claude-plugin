---
name: download-music
description: Download a song or album from YouTube (yt-dlp) or Soulseek (the `soulseek` MCP / slskd), check and fix its tags (title, artist, album, cover art), file it into ~/OneDrive/Music (Z-Trend + the matching genre folder, Best on request), then give clickable folder links. Asks which source first. Use when the user asks to download music, "tải nhạc", "down bài ...", "tải album ...", "kiếm bản FLAC ...", or pastes a YouTube link to save as audio.
argument-hint: "<bài hát / nghệ sĩ / album / link YouTube>"
---

# Download music

## 1. Ask the source

Ask with AskUserQuestion: **YouTube** or **Soulseek**. One line each: YouTube is quick and has almost everything, but the audio is lossy (AAC ~128 kbps); Soulseek can have real lossless (FLAC), but only what other users share.

Skip the question when the request already settles it: a YouTube link (`youtube.com`, `youtu.be`, `music.youtube.com`) means YouTube; "soulseek", "slsk" or "FLAC/lossless" named by the user means Soulseek.

## 2. YouTube

Needs a link. If the user has not given one, ask for it (plain question in the reply, not a search): do not guess a video.

```bash
yt-dlp -q --no-warnings --no-playlist \
  -f 'bestaudio[ext=m4a]/bestaudio' -x --audio-format m4a \
  --embed-metadata --embed-thumbnail \
  -o "$HOME/Music/YouTube/%(title)s.%(ext)s" \
  --print after_move:filepath '<url>'
```

- The last line printed is the saved file's path. `m4a` plays everywhere (Finder, Apple Music); when YouTube only offers Opus it is re-encoded to AAC.
- A playlist link the user wants whole: drop `--no-playlist` and save to `"$HOME/Music/YouTube/%(playlist_title)s/%(playlist_index)02d - %(title)s.%(ext)s"`.
- Long playlists: run it with `run_in_background: true`.
- Errors such as `Sign in to confirm`, `age-restricted` or `HTTP Error 403`: run `brew upgrade yt-dlp` once and retry; if it still fails, report the error line.

Then go on to step 4 with the printed file.

## 3. Soulseek

Needs the `soulseek` MCP server (tools `mcp__soulseek__*`, backed by a local slskd at `http://127.0.0.1:5030`) and `~/.config/slskd/secrets.env` holding `SLSKD_API_KEY`. If the tools are missing, say so and offer YouTube instead; if slskd does not answer, check `docker ps` for the `slskd` container (Docker Desktop must be running).

### Search

Call `search_music` with `limit: 60`. Try several spellings when results are thin: with and without Vietnamese diacritics, `artist title`, title alone. Each search takes up to ~40 s; run the variants in parallel.

### Pick the source

Rank the candidates, best first:

1. **The version asked for.** The original recording by the original artist, unless the user names a cover, remix or live version. Covers, "ca sĩ giấu mặt", remixes, `[1 HOUR]` loops and compilations are a different song: never pick one silently in place of the original.
2. **Real lossless.** FLAC/ALAC 16-bit 44.1 kHz (CD/WEB), or 24-bit hi-res from a store release (folder names like `WEB-FLAC`, `24BIT`, `CD`, `(2013 HDTracks 24-192)`).
   - Treat as **probably fake lossless**: 24-bit/48 kHz FLAC whose name says `MV`, `Official Video`, `Lyrics`, `YouTube`, `SpotubeDL`: a YouTube rip converted to FLAC. Rank it below a 320 kbps MP3.
3. **MP3 320** > V0 > lower bitrates.
4. **The peer can send now:** `has_free_slot: true` and a small `queue_length` beat a busy peer with the same file.

Skip peer `DeclivousUnshapen` ("SKYLiGHT"): it keeps free users queued indefinitely.

For an album, `browse_user` the chosen peer and download every audio file of that one folder from it (same release, same quality), plus the cover image if there is one.

If no source fits rank 1–2, show the user the 3–5 best candidates in a short table (version, format, quality, peer free or not) and ask which to take, mentioning YouTube as the fallback, instead of downloading something else.

### Download and wait

Call `download_music` with the exact `username`, `filename` and `size` from the search. Then wait for it with the script next to this file:

```bash
sh "<this skill's folder>/scripts/wait-download.sh" '<username>' '<filename exactly as returned>' 600
```

Run it with `run_in_background: true` for files expected to take more than a minute; otherwise in the foreground with a matching timeout. It prints `STATE=`, then on success `FILE=`, `DIR=` and `URL=` (a `file://` URI of the folder, already percent-encoded).

- `Queued, Remotely` for more than ~2 minutes while the peer reports a free slot: the peer is holding the file back. Say so, and offer the next-best source.
- `Completed, Errored` / `Rejected` / `TimedOut`: try the next-best source once, then report.

On success, go on to step 4 with `FILE=`.

## 4. Check and fix the metadata

Every downloaded file, before filing it. Use the script next to this file (run through `uv`, which brings `mutagen`):

```bash
T="<this skill's folder>/scripts/tags.py"
uv run -q "$T" show '<file>'                       # current tags, cover yes/no, duration, bitrate
uv run -q "$T" lookup '<artist> <title>' --limit 5  # iTunes catalogue candidates, JSON
uv run -q "$T" write '<file>' --title '...' --artist '...' --album '...' --album-artist '...' \
  --year 2018 --genre Pop --track 10 --cover '<cover URL or image path>'
```

1. `show` the file. YouTube files usually carry the video title as title (`Artist - Title (Official MV)`), the channel as artist, no album, and the video thumbnail (16:9, with logos) as cover; Soulseek files vary from perfect to empty.
2. `lookup` the song and pick the candidate that matches the version downloaded: same title and version (original / remix / acoustic / live), same artist, and `duration_s` within ~5 s of the file's. Prefer the original album or single over compilations ("Hits 2024", "Now That's What I Call...").
3. `write` what is missing or wrong:
   - **title**: the song name only, no `(Official MV)`, `[Lyrics]`, `| Artist`, `HD`. Keep a real version tag: `(Acoustic)`, `(Masew Remix)`.
   - **artist**: main artist(s) as in the catalogue, e.g. `Hòa Minzy, Tăng Duy Tân`; keep Vietnamese diacritics.
   - **album**, **album artist**, **year**, **genre**, **track**: from the matched candidate.
   - **cover**: the candidate's `cover` URL (1200×1200) whenever the file has none or has a YouTube thumbnail.
4. Nothing in iTunes (common for small V-Pop releases): fix title/artist by hand from the YouTube title or folder name, set album to `<title> (Single)` and the year from the upload date; for the cover, use the album's `cover.jpg`/`folder.jpg` from the Soulseek folder if there is one, otherwise keep what is there. Say in the report which fields could not be confirmed.
5. `show` again and check the output reflects the fix.

For an album, do it per track (same album, album artist, year and cover for all; `track` from the file name or the catalogue).

## 5. File it into the library

Library: `~/OneDrive/Music` (`/Users/quangvu/OneDrive/Music`). File name: `<Title> - <Artist>.<ext>` from the fixed tags, artists joined with `, `, guests as `(ft. X)`, e.g. `Bật Tình Yêu Lên - Hòa Minzy (ft. Tăng Duy Tân).m4a`. Replace `/` and `:` in names with `-`.

1. **Always** copy it into `~/OneDrive/Music/Z-Trend/`.
2. **Also** copy it into the folder for its genre/market. Use an existing folder, list them with `ls ~/OneDrive/Music`: `USUK` (English-language/Western), `V-Pop` (Vietnamese), `K-Pop`, `J-Pop`, `C-Pop`, `EDM`, `Lofi`, `Instrumental`, `Nhac Acoustic`, `Game`, `Sơn Tùng` (Sơn Tùng M-TP songs, as well as V-Pop), and the rest. If unsure (e.g. a Vietnamese remix of a C-Pop song), ask with AskUserQuestion, offering the 2–3 likely folders.
3. **Ask** with AskUserQuestion whether to also copy it into `~/OneDrive/Music/Best/` (Yes / No). For several songs, one multi-select question listing them.
4. If a file with the same name already exists in a target folder, do not overwrite silently: compare (`show` both) and ask whether to replace it when the new one is better quality, otherwise skip that copy and say so.
5. Use `cp -p`; after the copies are in place, delete the downloaded file from its download folder (`~/Music/YouTube/...` or `~/Music/Soulseek/complete/...`) so the library holds the only copy. For an album, keep the album's own subfolder name in each target: `~/OneDrive/Music/Z-Trend/<Album> - <Artist>/`.

## 6. Report

When it finishes, reply with:

- what was downloaded: title, artist, album, version, source, format and quality, and whether the quality is real or probably a rip (YouTube audio is always lossy);
- the metadata fixes made (e.g. "title cleaned, album + cover added from iTunes"), and any field that could not be confirmed;
- clickable links to each folder it went into, as Markdown links whose text is the folder path, e.g. `[📂 ~/OneDrive/Music/Z-Trend](file:///Users/quangvu/OneDrive/Music/Z-Trend)`. Clicking one opens the folder in Finder (the terminal opens `file://` links). Percent-encode non-ASCII names in the URL (`python3 -c 'import pathlib,sys;print(pathlib.Path(sys.argv[1]).as_uri())' '<dir>'`);
- what was not available (e.g. no lossless original on Soulseek) and what else could be fetched.
