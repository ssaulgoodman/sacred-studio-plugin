---
name: festival-montage
version: 2
format: Short 9:16, 25 to 40 s
---

# Festival montage

For festivals and occasions. It is the festival sting with energy:

- The greeting lands word by word on the beat over a blurred shot, then three flash frames.
- The rest cuts on every bar (four beats) between the strongest moments from **anywhere in the catalogue's finished videos**, found by meaning (diyas, lamps, the deity, festival lights), with a gold flash on every cut. The song's audio and lyrics stay its own.
- Every shot fills the 9:16 frame. The builder aims each crop at the sharpest part of the picture, usually the face or the idol. Nothing is zoomed; each shot keeps its own motion.
- Lyrics rise word by word low in the frame, with the reading and the English meaning. The title sits at the top over a short gold rule.
- Embers drift up and warm light moves slowly across.
- The last two seconds are a full-frame closing card with the greeting.

- **Inputs:**
  - `--shots shots.json`: `[{ "src": "<signed URL from fetch>", "at": tStart, "end": tEnd }]`, best first, from at least five different videos. The builder seeks into the URLs; nothing needs downloading.
  - `--clip`: optional. The song's own finished video, if you want its scenes as well.
  - `--greeting` and `--greeting-en`.
- **Section:** start 2 to 3 s before the first sung line, and run 25 to 35 s. Ending just after a refrain line lands best.
- **Greetings:** as in festival-sting.
