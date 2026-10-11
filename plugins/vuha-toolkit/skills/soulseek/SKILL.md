---
name: soulseek
description: Search Soulseek for a song or album, pick the best-quality real source, download it through the `soulseek` MCP (slskd), wait until it finishes and give a clickable link that opens the folder. Use when the user asks to download music, "tải nhạc", "down bài ...", "tải album ...", "kiếm bản FLAC ...".
argument-hint: "<bài hát / nghệ sĩ / album>"
---

# Soulseek download

Needs the `soulseek` MCP server (tools `mcp__soulseek__*`, backed by a local slskd at `http://127.0.0.1:5030`) and `~/.config/slskd/secrets.env` holding `SLSKD_API_KEY`. If the tools are missing, say so and stop; if slskd does not answer, check `docker ps` for the `slskd` container (Docker Desktop must be running).

## 1. Search

Call `search_music` with `limit: 60`. Try several spellings when results are thin: with and without Vietnamese diacritics, `artist title`, title alone. Each search takes up to ~40 s; run the variants in parallel.

## 2. Pick the source

Rank the candidates, best first:

1. **The version asked for.** The original recording by the original artist, unless the user names a cover, remix or live version. Covers, "ca sĩ giấu mặt", remixes, `[1 HOUR]` loops and compilations are a different song: never pick one silently in place of the original.
2. **Real lossless.** FLAC/ALAC 16-bit 44.1 kHz (CD/WEB), or 24-bit hi-res from a store release (folder names like `WEB-FLAC`, `24BIT`, `CD`, `(2013 HDTracks 24-192)`).
   - Treat as **probably fake lossless**: 24-bit/48 kHz FLAC whose name says `MV`, `Official Video`, `Lyrics`, `YouTube`, `SpotubeDL`: a YouTube rip converted to FLAC. Rank it below a 320 kbps MP3.
3. **MP3 320** > V0 > lower bitrates.
4. **The peer can send now:** `has_free_slot: true` and a small `queue_length` beat a busy peer with the same file.

Skip peer `DeclivousUnshapen` ("SKYLiGHT"): it keeps free users queued indefinitely.

For an album, `browse_user` the chosen peer and download every audio file of that one folder from it (same release, same quality), plus the cover image if there is one.

If no source fits rank 1–2, show the user the 3–5 best candidates in a short table (version, format, quality, peer free or not) and ask which to take, instead of downloading something else.

## 3. Download and wait

Call `download_music` with the exact `username`, `filename` and `size` from the search. Then wait for it in the background with the script next to this file:

```bash
sh "<this skill's folder>/scripts/wait-download.sh" '<username>' '<filename exactly as returned>' 600
```

Run it with `run_in_background: true` for files expected to take more than a minute; otherwise in the foreground with a matching timeout. It prints `STATE=`, then on success `FILE=`, `DIR=` and `URL=` (a `file://` URI of the folder, already percent-encoded).

- `Queued, Remotely` for more than ~2 minutes while the peer reports a free slot: the peer is holding the file back. Say so, and offer the next-best source.
- `Completed, Errored` / `Rejected` / `TimedOut`: try the next-best source once, then report.

## 4. Report

When it finishes, reply with:

- what was downloaded: title, version, format and quality, and whether the quality is real or probably a rip;
- a clickable link to the folder, made from the script's `URL=`, as a Markdown link whose text is the folder path, e.g. `[📂 ~/Music/Soulseek/complete/music](file:///Users/.../Music/Soulseek/complete/music)`. Clicking it opens the folder in Finder (the terminal opens `file://` links);
- what was not available (e.g. no lossless original) and what else could be fetched.
