---
name: shorts
description: Use when making 9:16 Shorts or Reels from catalogue songs with a Sacred template (kinetic hook, festival sting, meaning card), one song or a batch. Covers picking the section, the lyric lines and meanings, the footage, building the template and rendering it.
---

# Shorts from templates

A Short is one strong section of a song (20 to 40 seconds) over its finished footage, with the lyrics set by a template. The template owns the look and the motion; you choose the song, the section and, for festival work, the greeting. Every Short made from the same template looks like part of one series, which is the point.

## Templates

| Template | Use it for | Reads `templates/<name>/TEMPLATE.md` |
|---|---|---|
| `kinetic-hook` | The default. A chorus or hook line, cut on the beat | full-bleed footage as shot, the line rising word by word, reading and English beneath |
| `festival-sting` | Festivals and occasions (Diwali, Navratri, Ganesh Chaturthi) | a 2 to 3 second greeting opener on the beat with flash cuts, then the kinetic hook |
| `festival-montage` | Festivals, when the song has a finished video: the most energy | beat cuts between the video's best shots in a framed band, gold flashes, embers, kinetic lyrics, a greeting opener and closing card |
| `meaning-card` | Lines whose meaning is the hook | calm, the line small, its English meaning large in an editorial serif |

Read the template's TEMPLATE.md before using it. If the human names a template from the Sacred library page, use that name exactly.

## Fast path: a festival montage (about 16 calls)

1. **Projects:** find the song's own project with `find { in: "projects", query: "<song name>" }`; the finished Short ends up there (step 9). Composition bundles can't be uploaded to catalogue song projects yet, so build and render in the festival's working project. Use `find { in: "projects", query: "Diwali Shorts" }` and reuse it; create it with `pack start_project_from` (see step 0 below) only if it doesn't exist.
2. `open { song }` for `masterAudio` and the song ID.
3. `find { kinds: ["lyric_line"], filters: { songId }, limit: 50 }`: write the original-script lines with their times and meanings to `lines.json`.
4. **Shots from the whole catalogue:** `find { query: "rows of glowing diyas, oil lamps, the goddess, festival lights", kinds: ["video_window"], filters: { finalVideo: true }, limit: 24 }`, with no song filter. Keep about 16 moments from at least five different videos, best first, and include two or three from the song's own video.
5. `fetch` each distinct video for its signed URL, then write `shots.json` as `[{ "src": url, "at": tStart, "end": tEnd }]`. The URLs last 15 minutes, so build straight away.
6. `node build.mjs --template festival-montage --shots shots.json --lines lines.json --audio master.wav --start ... --duration 30 --greeting ... --greeting-en ... --out short --tar`.
7. `npx hyperframes check` in the output folder (it must pass; the cloud renderer runs it too), then snapshot five times and look.
8. `save` the `.tar.gz` into the festival project, then `render` it with `wait: false`. A render takes 2 to 4 minutes, so call `wait` until it finishes, then `fetch` the output and look at it.
9. File it in the song's project: `save { projectId: <song project>, source: { assetId: <output> }, kind: "video", stage: "shorts", slot: "diwali:festival-montage", label }`. Then `ask` for review there.

Skip analytics, library browsing and `describe` unless asked; this path needs none of them.

## From a song to a Short

0. **Project:** work in a project of the workspace that holds the catalogue (for Lahari songs, the Lahari workspace). `save { project }` creates in your personal workspace, where catalogue songs do not open; start a Lahari project with `pack { actionKey: "start_project_from" }` from that workspace's library entries (the template and style you will use) and an existing Lahari project ID.
1. **Song:** `open { song }`. Use the original language and script (`originalLanguage`; the subtitles handles cover san, kan, tel, tam, mal).
2. **Section:** pick 20 to 40 seconds, usually the opening refrain or a chorus. `structure.sections` helps when present; confirm against the lyric times. For `festival-sting`, start 2 to 3 seconds before the first sung line so the greeting lands on the instrumental.
3. **Lines and meanings:** `find { kinds: ["lyric_line"], filters: { songId } }` returns every line with its times, text and model-written English meaning. Write them to `lines.json` as `[{ start, end, text, meaning }]` in song time.
4. **Base and audio.** The base is what sits under the type.
   - **Icon (default, `--base icon`):** a deity loop held full frame. `open { song }` returns the song's `assignedClip` or `clipCandidates` for its deity; download one from its signed URL. This is the look the channel's audience rewards (see the library's "Icon as hero" entry). Set `--focus-x` so the deity's face is in the 9:16 crop, and check it in a snapshot. `--focus-x` places the crop's left edge: for a 16:9 loop with the face at fraction `f` across the frame, use `(f - 0.16) / 0.68` (a face at 0.27 gives 0.16; centred gives 0.5).
   - **Footage (`--base footage`):** the song's finished video (`find` with `kinds: ["video_window"]` and `filters: { songId, finalVideo: true }`; check `metadata.songAligned`), played song-aligned.
   The master audio comes from `open { song }`. Download with `fetch` or the signed URL.
5. **Build:** from this folder,
   ```bash
   node build.mjs --template festival-sting --base icon --focus-x 0.72 --lines lines.json --lang kan --clip deity-loop.mp4 --audio master.wav \
     --start 27 --duration 30 --title "Shukravaara Bandaaga" --greeting "ಶುಭ ದೀಪಾವಳಿ" --greeting-en "Happy Diwali" --out short --tar
   ```
   Optional: `--focus-x 0.4` moves the 9:16 crop toward the subject (0 left, 1 right); `--clip-offset` when the footage is not song-aligned. Beats come from `beats.py` (librosa); without it the template uses a steady grid.
6. **Check before rendering:** `npx hyperframes check` must pass (the cloud renderer runs it and fails otherwise), then `npx hyperframes snapshot --at 1,4,12,25` in the output folder and look at the frames: text legible, not over a deity's face, the crop holds the subject.
7. **Render:** `save` the `.tar.gz` with `kind: "composition_bundle"`, then `render { composition: { bundle: { uploadId } }, template: { name, version: 1 }, idempotencyKey }`. Several Shorts are one `batch` of render items; `wait` on the returned IDs. A 30 second Short takes three to four minutes to render, so start the render before talking it through.
8. **Review:** `fetch` each output, look at a few frames, then `ask` once for all of them.

## Rules

- Never put lyrics over a deity's face; move the crop (`--focus-x`) or pick another section.
- Meanings are model-written. Keep them short and literal; never invent a meaning for a line that has none.
- Greetings go in the song's script, with the English beneath (`ಶುಭ ದೀಪಾವಳಿ` / Happy Diwali; `शुभ दीपावली` for Devanagari).
- Never add zooms, punch-ins or camera moves to finished footage; it has its own.
- Do not restyle a template inside a job. If a look should change, say so to the human; templates change in the library, not per Short.
