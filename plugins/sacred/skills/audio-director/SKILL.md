---
name: audio-director
description: Use when writing, reviewing, or producing Sacred dialogue and narration — audio plans, voice assignment, Native dialogue, TTS overlay, Source-song mouth timing, and voice change.
---

# Audio Director

You plan produced speech and choose who owns the audible voice. Keep it as production data, not commentary.

## First Move

Read `audio-plan.md`, `state/cast.md`, and the relevant script shots. Decide:

- Which shots need speech?
- Should the project use **Native dialogue** or **TTS overlay**?
- Does any music-led shot need **Source-song mouth timing** without generated provider audio?
- Does every speaking cast member have a voice?
- Should visible dialogue be generated natively by the video model, then voice-changed?
- Would silence, music, or reaction staging be stronger?

Edit `audio-plan.md`, then persist with `run_action(apply_audio_plan)`.

## Audio Plan Pattern

Each dialogue line needs only supported production data:

- speaker/cast member
- exact spoken text
- shot mapping
- optional `startMs` / `endMs` or `targetSec` timing

The saved plan still requires one compatibility `dialogueStrategy` value (`lipsync` or `overlay`); keep it aligned with the authoritative project `dialogueMode` rather than treating it as a per-line choice.

Keep lines short and actable. Dialogue should reveal choice, pressure, or relationship. Narration should clarify structure or tone, not describe what the viewer already sees.

## Choose The Lever

- **Plan or revise speech** -> `run_action(apply_audio_plan)`.
- **Assign voice** -> `run_action(apply_cast_voice)`.
- **Choose ElevenLabs model** -> set project default with `run_action(apply_project_preferences, { preferences: { ttsModel: "eleven_multilingual_v2" | "eleven_v3" } })`, or pass `voiceModel` on one `generate_dialogue_audio` run.
- **Check cost/missing voices** -> `run_action(generate_dialogue_audio, { dryRun: true })`.
- **Generate TTS** -> `start_job(generate_dialogue_audio)` after approval.
- **Choose Native dialogue or TTS overlay** -> `run_action(apply_project_settings, { settings: { dialogueMode } })` with `native_dialogue` or `tts_overlay`.
- **Use source-song mouth timing for one shot** -> `run_action(apply_shot_prompts, { shots: [{ shotId, sourceSongMouthTiming: true }] })`. This sends a source-song timing reference but keeps provider-generated audio off.
- **Generate Native dialogue** -> write the audio plan, choose `native_dialogue`, then generate video. The provider owns audible speech and mouth movement.
- **Voice-change native dialogue video** -> after reviewing the raw native-dialogue clip, call `run_action(voice_change_video, { dryRun: true })`, then `start_job(voice_change_video)` after approval. One segment can cover the whole clip; multi-speaker shots need explicit cut ranges.

## Three Separate Concepts

- **Native dialogue**: the video provider generates audible speech and mouth movement. Review the raw clip, then voice-change it if the voice identity is wrong.
- **TTS overlay**: the provider performs the visible line with audio generation off. Sacred generates TTS separately, mutes the clip's native audio for that shot, and mixes the TTS over a ducked source bed at render.
- **Source-song mouth timing**: a per-shot visual-performance reference from the uploaded song. It never means Native dialogue and never turns provider audio on.

Use TTS overlay for narration, off-screen speech, or when voice identity matters more than provider-native delivery. Use Native dialogue when visible speech performance and mouth accuracy are primary.

## Native Dialogue Path

For visible dialogue where provider-native performance is useful:

1. Save dialogue lines and optional timing in the audio plan.
2. Generate video with native audio so the model creates speech and mouth movement together.
3. Review the raw clip.
4. Voice-change the clip with `voice_change_video`.
5. Use explicit segment ranges for two speakers; write shots to avoid rapid back-and-forth inside one clip.

Do not generate TTS for this path unless the artist specifically wants TTS overlay or a model-supported audio-input experiment.

Every paid call in this skill uses `start_job(actionKey, input, idempotencyKey)`. Choose one stable 1-200 character key per artist-approved intent, reuse it only for transport retry of that exact action/input, and choose a new key for newly approved work. JSON-RPC request IDs are diagnostics, not retry identity.

## Ask Before

TTS is paid. Dry-run first, report missing voices/cost, then ask. Never generate with missing or uncertain voices.

After any paid audio `start_job`, return the job id and keep working unless the artist explicitly asks you to watch or poll. Studio realtime is the default progress surface; use `get_job` for deliberate checks/watch mode, not habit loops.

## Avoid

- Generating paid speech or voice-change before voice assignment.
- Paragraphs instead of line-level data.
- Dialogue that explains an emotion the shot should stage.
- Lipsync for hidden mouths or irrelevant mouths.
- Filling every quiet beat with speech.
