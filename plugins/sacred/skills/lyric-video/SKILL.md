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
- For a catalogue song, `open { song }` returns its facts, a subtitles handle per script (`catalogue:<songId>:<script>`), the master audio and the assigned clip as short-lived downloads. These are the client's masters: download them for the job and do not re-upload them as library assets.
- Default to the song's original language and script unless the artist asks otherwise. Sanskrit, Kannada, Telugu, Tamil and Malayalam scripts are available from the catalogue; name the alternatives when discussing language.
- Clips and artwork already in the workspace come from `find { in: "library" }`.

## Shorts from footage already in Sacred

`open { song }` gives `structure.sections`; prefer a chorus for the chosen range, and check the model-written structure against the audio. Find the song's finished music video with `find` using `kinds: ["video_window"]`, `filters: { songId, finalVideo: true }`, and check its `metadata.songAligned` before using song times as video times. Read `styles/catalogue/STYLE.md`, then write a document: `format` 1080x1920, one `video` clip from that asset with `fit: "contain-blur"`, a `text` track with the song's subtitles handle and `style: "catalogue"`, and the master audio range with a 0.3 s fade in and 1.0 s fade out. `render` it with stage `shorts`, slot `short:<theme>` and label `<Song> Short (m:ss to m:ss)`; it waits for the file. `fetch` the output, look at a few frames, then `ask` for review of that asset. Footage is fetched and recorded as an input automatically.

## The loop

1. Build the composition. Run `npx hyperframes check` in the folder; it must pass.
2. Snapshot a few frames (`npx hyperframes snapshot --at ...`) and look at them yourself: the first line, the longest line, and the busiest part of the clip. Fix overlaps with the deity's face before anyone sees it.
3. Pack the folder as `.tar.gz`, upload it with purpose `composition_bundle`, and tell the human it is ready to watch live on the project page. Each upload is a new version.
4. Read their comments, which carry the moment they refer to. Edit, re-upload, repeat. Small nudges (size, position, colour) are build flags for the catalogue style.
5. Render the requested FFmpeg edit after checking proxy frames. For a HyperFrames composition, get preview approval before rendering. Catalogue videos: `render` a document with `style: "catalogue"`. Signature pieces: `render_composition`. Pass the clip, subtitle file and other Sacred sources as `inputs`, then `wait` with its run until the requested output finishes, repeating on `timedOut`. The MP4 lands on the project page with its lineage and compute cost.

Use HyperFrames to render only when the frames are designed motion. Anything FFmpeg can do (burn subtitles, loop a clip under audio, trim, join, scale, overlay) goes to `render`; it is tens to hundreds of times faster.

For a batch, get one song approved first, then build the rest with the same settings, snapshot one frame per video to catch bad lines or clips, and render.
