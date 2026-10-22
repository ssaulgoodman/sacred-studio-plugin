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
| `meaning-card` | Lines whose meaning is the hook | calm, the line small, its English meaning large in an editorial serif |

Read the template's TEMPLATE.md before using it. If the human names a template from the Sacred library page, use that name exactly.

## From a song to a Short

1. **Song:** `open { song }`. Use the original language and script (`originalLanguage`; the subtitles handles cover san, kan, tel, tam, mal).
2. **Section:** pick 20 to 40 seconds, usually the opening refrain or a chorus. `structure.sections` helps when present; confirm against the lyric times. For `festival-sting`, start 2 to 3 seconds before the first sung line so the greeting lands on the instrumental.
3. **Lines and meanings:** `find { kinds: ["lyric_line"], filters: { songId } }` returns every line with its times, text and model-written English meaning. Write them to `lines.json` as `[{ start, end, text, meaning }]` in song time.
4. **Base and audio.** The base is what sits under the type.
   - **Icon (default, `--base icon`):** a deity loop held full frame. `open { song }` lists `clipCandidates` for the song's deity; download one from its signed URL. This is the look the channel's audience rewards (see the library's "Icon as hero" entry). Set `--focus-x` so the deity's face is in the 9:16 crop, and check it in a snapshot.
   - **Footage (`--base footage`):** the song's finished video (`find` with `kinds: ["video_window"]` and `filters: { songId, finalVideo: true }`; check `metadata.songAligned`), played song-aligned.
   The master audio comes from `open { song }`. Download with `fetch` or the signed URL.
5. **Build:** from this folder,
   ```bash
   node build.mjs --template festival-sting --base icon --focus-x 0.72 --lines lines.json --lang kan --clip deity-loop.mp4 --audio master.wav \
     --start 27 --duration 30 --title "Shukravaara Bandaaga" --greeting "ಶುಭ ದೀಪಾವಳಿ" --greeting-en "Happy Diwali" --out short --tar
   ```
   Optional: `--focus-x 0.4` moves the 9:16 crop toward the subject (0 left, 1 right); `--clip-offset` when the footage is not song-aligned. Beats come from `beats.py` (librosa); without it the template uses a steady grid.
6. **Check before rendering:** `npx hyperframes snapshot --at 1,4,12,25` in the output folder and look at the frames: text legible, not over a deity's face, the crop holds the subject.
7. **Render:** `save` the `.tar.gz` with `kind: "composition_bundle"`, then `render { composition: { bundle: { uploadId } }, template: { name, version: 1 }, idempotencyKey }`. Several Shorts are one `batch` of render items; `wait` on the returned IDs. A 30 second Short renders in about a minute.
8. **Review:** `fetch` each output, look at a few frames, then `ask` once for all of them.

## Rules

- Never put lyrics over a deity's face; move the crop (`--focus-x`) or pick another section.
- Meanings are model-written. Keep them short and literal; never invent a meaning for a line that has none.
- Greetings go in the song's script, with the English beneath (`ಶುಭ ದೀಪಾವಳಿ` / Happy Diwali; `शुभ दीपावली` for Devanagari).
- Never add zooms, punch-ins or camera moves to finished footage; it has its own.
- Do not restyle a template inside a job. If a look should change, say so to the human; templates change in the library, not per Short.
