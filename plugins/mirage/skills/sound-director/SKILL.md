---
name: sound-director
description: Use when deciding how uploaded source audio should affect a Sacred project — soundtrack bed, transcription, structure analysis, pacing influence, source meaning, or no analysis.
---

# Sound Director

You decide how source audio should shape the project. This is for uploaded songs, recordings, voice memos, or soundtrack beds. For produced dialogue/TTS, use audio-director.

## First Move

First call `run_action(get_source_analysis)` when the artist asks for saved lyrics, meaning, musical structure, timing, or cut/remix guidance. Read `state/audio-analysis.md`, `state/brief.md`, and the project intent as the local snapshot/fallback. Classify the audio:

- **Soundtrack bed** — plays under the video; no analysis unless requested.
- **Structural source** — sections, energy, beat drops, or timing should shape scenes.
- **Meaning source** — lyrics or spoken content should shape concept/script.
- **Mood reference** — informs tone but does not need detailed analysis.

Spend only if analysis will change script, pacing, or production choices.

## Choose The Lever

- **Read saved source intelligence** -> `run_action(get_source_analysis)`; this returns stored lyrics, structure, and meaning without spending or mutating.
- **Attach only** -> keep `audio_source`; move on.
- **Canonical words available** -> `run_action(apply_source_lyrics)`; do not spend on transcription just to rediscover known lyrics or source text.
- **Words matter** -> `start_job(analyze_audio_transcribe)` after approval.
- **Timing/energy matters** -> `start_job(analyze_audio_structure)` after approval.
- **Both matter** -> run transcription and structure, then fold findings into concept/script.

Uploading audio does not automatically analyze it.

Lyric transcription uses only the Echo lyrics engine, with Gemini for words and an Indic forced aligner for timing. Supply `language` as Tamil, Kannada, Telugu, Malayalam, Sanskrit, or Hindi unless the project already has a supported language. `genre` defaults to `devotional`; request another genre when appropriate. Optional `transliterations` accepts any of those script names plus English. Sacred saves timestamped source lyrics, source/transliteration SRT assets, engine version provenance, and reported spend.

The existing job polls Echo every 10 seconds for up to 30 minutes. Missing engine configuration, unsupported language, or an engine failure stops transcription. Never fall back to Sacred Gemini or resubmit blindly after a timeout. Ask the owner to configure the lyrics engine when unavailable; use `apply_source_lyrics` when the artist supplies canonical text.

## Use The Result

Transcription and applied source lyrics are source material, not automatic dialogue. Structure is pacing evidence, not a mandatory scene list. Convert the analysis into concrete decisions: scene boundaries, shot duration, visual emphasis, lyric references, or what to ignore.

If a long-track transcription is partial, regresses, or stops far before the structure end time, preserve the better source and use `apply_source_lyrics` with canonical/artist-provided text. Do not keep rerunning paid transcription blindly.

Every paid call in this skill uses `start_job(actionKey, input, idempotencyKey)`. Choose one stable 1-200 character key per artist-approved intent, reuse it only for transport retry of that exact action/input, and choose a new key for newly approved work. JSON-RPC request IDs are diagnostics, not retry identity.

## Ask Before

Audio analysis is paid. State the question first: “Do we need lyrics meaning?” or “Do we need section timing for scene pacing?”

After an audio-analysis `start_job`, return the job id and keep working unless the artist explicitly asks you to watch or poll. Studio realtime is the default progress surface; use `get_job` for deliberate checks/watch mode, not habit loops.

## Avoid

- Analyzing every uploaded audio file.
- Rerunning transcription after a partial/regressed result when canonical lyrics are available.
- Ignoring structure on a music-led project.
- Turning lyrics into literal on-screen text by default.
- Treating source audio as produced dialogue; that is audio-director territory.
