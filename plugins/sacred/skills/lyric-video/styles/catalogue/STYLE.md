# Catalogue lyric style

The house look for catalogue lyric videos: one deity or mood clip looped under the whole song, with each lyric line unveiled when it is sung. It is the look of the 800 Lahari lyric videos already published, ported from the Echo renderer (echo-live-wallpapers `cloud/render_style.py` and the dashboard's pixel-matched preview). Keep the two in step: if a number changes here, it changes there, and the reverse.

Use it for volume work, where every video should look the same and the only choices are the clip, the language and small placement nudges. For one-off videos with their own idea, use a signature style instead.

## Build: preview and render

The same settings build two things that look the same.

```bash
# Live preview on the project page (HyperFrames composition)
node build.mjs --srt <song>_<lang>.srt --lang kan --clip <loop>.mp4 --audio <song audio> --out <preview dir> --tar
# The render (FFmpeg job: subtitles burned in by libass, exactly as Echo renders)
python3 build_ffmpeg.py --srt <song>_<lang>.srt --lang kan --clip <loop>.mp4 --audio <song audio> --out <job dir> --tar
```

Optional on both: `--start 27 --duration 33` for an excerpt, `--position right-third|left-third|bottom-third|bottom-center`, `--size`, `--color`, `--offset-x`, `--offset-y` (positive raises the text). Each writes `composition.json` recording every setting and source.

- Upload the preview `.tar.gz` with purpose `composition_bundle` so people can watch and comment before anything renders.
- Render with `render` and a document whose text track uses `style: "catalogue"`; Sacred builds the subtitles, fonts and FFmpeg job.
- Never render catalogue videos through HyperFrames. A 4.5 minute song takes about 37 minutes that way and about 12 seconds through FFmpeg.

`render_style.py` keeps Echo's rendering logic from `echo-live-wallpapers cloud/render_style.py`, commit `1f444ed`, with frame dimensions and placement presets now parameterized using the original defaults. Echo's copy needs the same parameter change. Keep future look changes in step there and in `build.mjs`. `pip install uharfbuzz` lets the reveal measure each line; without it the reveal sweeps the whole placement box.

## Cut a Short from a finished video

`open { song }` and choose a section from `structure.sections`, preferably a chorus. Structure is model-written and may be null, so confirm the range against the song. `find` with `kinds: ["video_window"]` and `filters: { songId, finalVideo: true }` gives its finished music video; check `metadata.songAligned` before treating song times as video times.

Use the original language and script unless the artist asks otherwise; the song's subtitles handles cover Sanskrit, Kannada, Telugu, Tamil and Malayalam. Write the document:

```json
{
  "format": { "width": 1080, "height": 1920, "fps": 30, "duration": 30 },
  "video": [{ "asset": "<finished-video-assetId>", "in": 83, "out": 113, "at": 0, "fit": "contain-blur" }],
  "text": [{ "subtitles": "catalogue:<songId>:san", "from": 83, "to": 113, "style": "catalogue", "position": { "bottom": 430 } }],
  "audio": [{ "asset": "<master-audio-assetId>", "in": 83, "out": 113, "fadeIn": 0.3, "fadeOut": 1.0 }]
}
```

`text.from`/`to` and `audio.in`/`out` are song times; `video.in`/`out` are times in the video. `render` it with stage `shorts`, slot `short:<theme>` and label `<Song> Short (m:ss to m:ss)`. It waits for the file; `fetch` it, inspect a few frames, then `ask` for review of the output asset. A revision edits the document (`open { job }` returns it) and renders again with the same slot. A larger `text.position.bottom` raises the lyrics. An artist-requested FFmpeg render needs no extra approval.

Shorts are 1080x1920. The source picture fills the width, centred and lifted 160 px, over a full-frame copy with `boxblur=30:2,eq=brightness=-0.18`. Lyrics sit bottom-centre at `bottom: 430`. Telugu size is 88; other language defaults scale by 88/120 before their existing script multiplier. Colour, outline, shadow, reveal and wrapping are unchanged. This Short format uses FFmpeg and the rendered asset review; `build.mjs` remains the landscape preview builder.

## The look, and why

| Setting | Value | Why |
|---|---|---|
| Frame | 1920x1080, the clip scaled to cover and centre-cropped | Clips arrive at other sizes (2560x1440 Lakshmi loops). Letterboxing in one engine and not the other was a real bug. |
| Placement | Right third by default: the box from x 920 to 1770, text centred in it, vertically centred in the frame | Deity art is usually centred or left; the right third keeps the lyrics off the face. Left third (80 to 920) and bottom third exist for clips where the deity sits right. Check the first and the busiest frame of the clip before choosing. |
| Fonts | Sanskrit: Rozha One (faux bold). Kannada, Tamil, Telugu, Malayalam: Noto Serif in the script, weight 700 | A serif with real script support. The files are in `fonts/` (OFL). Never let a system fallback font render a script; that is how wrong conjuncts ship. |
| Size | 120, Kannada 100. Tamil drawn at 0.6x and Malayalam at 0.75x of the chosen size | These fonts carry very different vertical metrics. The CSS size is the chosen size times the font's em ratio (0.704 Rozha, 0.592 Kannada, 0.641 Tamil, 0.684 Telugu, 0.802 Malayalam), which is how libass sizes text. |
| Colour | Warm cream #FFD4A3 | Reads against saturated reds, golds and dark backgrounds alike. |
| Contrast | 3 px black outline and a hard 5 px shadow at 50% black, down and right | This is the house look. Softer and no shadow were compared and rejected on 2026-09-28. A light colour gets a black outline, a dark colour a dark grey one. |
| Line breaks | At ॥ and । first, then commas, then at spaces so no line passes 20 characters. Words are never split. Four or more lines get a blank line after the first two | An Indic word cut mid-akshara with a hyphen is unreadable. |
| Reveal | The line unveils left to right across its own width, plus 24 px either side, over 0.8 s, then shows in full | Sweeping across the whole frame made right-side lyrics appear about 0.5 s late and threw away the aligner's timing. |
| Exit | Fades out over the last 0.3 s of the line | |
| Timing | Exactly the SRT's cue times. All five languages share one timing | The lyrics engine aligns to the audio. Human-typed times were rounder and later; on Heramba the engine was right by 1 to 2.7 s. |

## Refuse to render when

- The SRT text is garbled (UTF-8 read as Windows-1252, like `à¤¹à¤°à¥‡`). `build.mjs` refuses it. 119 Sanskrit SRTs were damaged this way once; repair the SRT first.
- The lyrics are not from the lyrics engine or a human review. Gemini batch timings drift.
- A line carries a `word_not_heard` flag from the engine that nobody has listened to. Gemini sometimes invents a word and the aligner still gives it a slot.

## Proof it matches Echo

The FFmpeg build produces Echo's own subtitle file, so its frames are Echo's frames. Shukravaara Bandaaga's 33 s excerpt rendered in 2.2 s on a laptop.

Rebuilt Shukravaara Bandaaga (Kannada, 0:27 to 1:00) with `build.mjs` and rendered the same range with Echo's own `render_style.py` through FFmpeg and libass. Frames at the same instants match in placement, size, font, colour, outline and shadow. The reveal differs by a few frames inside its 0.8 s, because Echo measures text width with HarfBuzz and the browser lays it out itself.
