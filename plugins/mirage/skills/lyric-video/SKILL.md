---
name: lyric-video
description: Use when making a lyric video for a song in Sacred Studio, one song or a catalogue batch, in any of the five Indic scripts. Covers sourcing the subtitle files, audio and clip, choosing a style (catalogue house look or a signature piece), building the HyperFrames composition, the live-preview review loop on the project page, and the cloud render.
---

# Lyric videos

A lyric video places a clip or artwork under the song, with the lyrics on screen when they are sung. Catalogue jobs use FFmpeg; designed motion uses HyperFrames and its live preview. You build it; the human watches, comments and approves.

## Styles

Each style is a folder in `styles/` with a `STYLE.md` (the look and why) and usually a build script.

- **catalogue**: the house look for volume work. One clip looped, lines unveiled in cream serif with an outline and hard shadow, right third by default. Same as the published Lahari catalogue. `styles/catalogue/build.mjs` makes the live preview and `build_ffmpeg.py` makes the render job; do not restyle it per song.
- **Signature** pieces have no fixed style. Read the `hyperframes` skills and design one for the song: word-by-word timing, motion, typography, multiple clips. Keep three things from the catalogue rules: the lyrics are legible over every frame (outline, shadow or a scrim), timing comes from the lyrics engine, and the script's own font, never a fallback. If a signature look works and will be reused, propose saving it as a new style folder.

## Sources

- **Lyrics** come only from the echo lyrics engine or a human review (`lyricsSource` engine or human_reviewed). Never batch Gemini timings. All five scripts share one timing. A line flagged `word_not_heard` needs a human listen before it ships.
- For a catalogue song, `get_catalogue_song` returns its facts, the subtitle file per script, the master audio and the assigned clip as short-lived downloads. These are the client's masters: download them for the job and do not re-upload them as library assets.
- Default to the song's original language and script unless the artist asks otherwise. Sanskrit, Kannada, Telugu, Tamil and Malayalam scripts are available from the catalogue; name the alternatives when discussing language.
- Clips and artwork already in the workspace come from `search_library`.

## Shorts from footage already in Sacred

Read `get_catalogue_song.structure.sections` and prefer a chorus for the chosen range; the structure is model-written, so check it against the audio. Find the finished music video with `search_media` using `filters: { songId, finalVideo: true }` and `kinds: ["video_window"]`, with `distinctAssets: true` when finding the finished asset. Choose the matching asset and check its `metadata.songAligned` before using song timestamps as video timestamps. Read `styles/catalogue/STYLE.md`, then run `build_ffmpeg.py --format short --clip-asset <assetId> --clip-start <seconds> --clip-duration <seconds>` with the trusted SRT, language, master audio and empty output folder. It makes the vertical catalogue layout and packages only the subtitles, font, audio range and job metadata. Upload with `purpose=composition_bundle`; pass the complete `ffmpeg-job.json` including `assets` and `args` to `render_media` with `projectId` and `bundle`. Set stage `shorts`, slot `short:<theme>`, and label `<Song> Short (m:ss to m:ss)`. Shorts default to a 0.3 s audio fade in and 1.0 s fade out; `--fade-in` and `--fade-out` change them, and 0 disables either. Before rendering, fetch clip-range thumbnails with `includeThumbs: true` and build local proxy JPGs with repeated `--preview <still.jpg> <output-seconds>`. Inspect them. After dispatch, call `wait_for_job` with the returned `runId`, using `timeoutSec: 50` in Codex. Repeat on `timedOut` until terminal. On success download its `downloadUrl`, inspect actual output frames and then `request_review` for that asset. Footage is fetched and recorded as an input automatically; no operator download or re-upload is needed.

## The loop

1. Build the composition. Run `npx hyperframes check` in the folder; it must pass.
2. Snapshot a few frames (`npx hyperframes snapshot --at ...`) and look at them yourself: the first line, the longest line, and the busiest part of the clip. Fix overlaps with the deity's face before anyone sees it.
3. Pack the folder as `.tar.gz`, upload it with purpose `composition_bundle`, and tell the human it is ready to watch live on the project page. Each upload is a new version.
4. Read their comments, which carry the moment they refer to. Edit, re-upload, repeat. Small nudges (size, position, colour) are build flags for the catalogue style.
5. Render the requested FFmpeg edit after checking proxy frames. For a HyperFrames composition, get preview approval before rendering. Catalogue videos: upload the job folder from `build_ffmpeg.py --tar` and call `render_media` with `args` and `output` from its `ffmpeg-job.json`. Signature pieces: `render_composition`. Pass the clip, subtitle file and other Sacred sources as `inputs`, then call `wait_for_job` and stay until the requested output finishes. Keep `timeoutSec` below the client tool timeout, using 50 in Codex, and call again on `timedOut`. The MP4 lands on the project page with its lineage and compute cost.

Use HyperFrames to render only when the frames are designed motion. Anything FFmpeg can do (burn subtitles, loop a clip under audio, trim, join, scale, overlay) goes to `render_media`; it is tens to hundreds of times faster.

For a batch, get one song approved first, then build the rest with the same settings, snapshot one frame per video to catch bad lines or clips, and render.
