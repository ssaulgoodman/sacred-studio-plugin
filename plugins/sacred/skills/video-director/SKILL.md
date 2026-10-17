---
name: video-director
description: Use when generating or fixing Sacred shot video — keyframe versus storyboard mode, motion prompts, model behavior, cost checks, audio cues, reference strategy, and repair decisions before spending.
---

# Video Director

Video is the expensive end of the pipeline. Your job is to make sure the still input is right, the motion instruction is specific, the model is appropriate, and the artist approves the spend.

## First Move

Start with `get_shot_context(projectId, shotId)` when available. It gives the shot mode, active board/frame, refs, prompt payload summaries, saved slot defaults, generation eligibility, and next actions without pulling the whole project or full prompt bodies. Then ask:

- Is this **keyframe mode** or **storyboard mode**?
- Is the board/frame good enough to animate?
- Is the failure in script, refs, board/frame, motion wording, audio cue, or model?
- Have you run `run_action(generate_video, { dryRun: true, dryRunSummary: true })` for requirements/cost/segment anatomy? Pull the exact full prompt only when diagnosing.
- Is there a project workflow recipe already applied for this format?

Do not generate video to discover what a bad still already tells you.

## Video Feedback Correction Loop

When `open_project` or `get_shot_context` reports open or addressed video feedback, keep the review evidence bound to its exact shot and video asset:

If the artist gives a typed note and asset-local timestamp/range through the director session, record it with `run_action(create_video_feedback)` against the exact active `videoAssetId`. Sacred captures the bounded frame server-side and returns the actual captured timestamp. Never invent a timestamp from another clip version.

1. Call `list_video_feedback` for the project or shot and read the compact timestamped items. Do not pull every frame into context.
2. Call `get_video_feedback` for one item and inspect its exact captured frame before diagnosing. The frame belongs to the recorded `videoAssetId`; do not apply its timestamp to another clip version.
3. Diagnose whether the failure belongs to motion wording, board/keyframe, refs, audio, or model behavior. Repair the upstream cause or dry-run a regeneration before spending.
4. After artist approval and generation, confirm the replacement is the accepted active shot video, then call `run_action(address_video_feedback)` for that one item and replacement asset. A replacement never addresses feedback merely by becoming active and never resolves feedback automatically.
5. Ask the artist/director to review the addressed replacement. Only after that review call `run_action(resolve_video_feedback)`, or call `run_action(reopen_video_feedback)` for another correction pass. Reopen retains the prior replacement link as audit history. Use `run_action(dismiss_video_feedback)` only as a separate explicit decision.

Do not create a feedback polling/wait loop. Studio is the progress surface for generation, and artist review is an explicit handoff. If the feedback tools are unavailable, stop with the normal restart/login instruction; do not fall back to browser control.

## Modes

**Keyframe mode:** the start frame carries visual state. The motion prompt says what changes over time. Do not restuff character/style/environment design.

**Storyboard mode:** the active board is primary; video generation auto-approves and records the storyboard version it uses. Attached active style/cast/environment references are sent with it, when present. If the board is wrong, fix storyboard first.

If an uploaded/native image should be the start frame, upload with `purpose=keyframe_image`, then call `run_action(import_keyframe_image)`. Use `apply_shot_workflow_modes` only when the shot must force keyframe or storyboard instead of auto.

Seedance cannot use `first_frame_url` and `reference_images` together. Keyframe prioritizes frame control; storyboard prioritizes board plus refs.

## Motion Prompt Pattern

One short paragraph:

- start from the visible still/board state
- name graph entities only when needed
- describe physical motion, timing, and performance
- include dialogue/sound cues only when they should affect visible action or native audio
- avoid new visual design

Name camera movement in standard terms when the shot needs one — push-in, pull-back, pan, tilt, dolly, tracking, orbit — and support separately when it matters: locked-off, handheld, Steadicam/gimbal. In keyframe mode prefer one dominant camera move per clip; in storyboard mode follow the approved cut plan — multiple motivated transitions are valid. Light may change only as visible action (“the lamp gutters”, “headlights sweep the wall”); lighting continuity and grade come from the visible board/frame and the attached active references, not from motion-prompt prose.

Good:

> The Boss holds in the doorway for a beat, then steps slowly into the Red Den Room, eyes moving from the empty desk to The Knife Orchid. She remains seated, only her hand tightening on the armrest.

Weak:

> Cinematic slow dolly with intense emotions, dramatic lighting, premium action.

## Choose The Lever

- **Save keyframe motion text** -> `run_action(apply_video_prompt)`. It does not generate.
- **Use an existing/native image as start frame** -> `run_action(import_keyframe_image)`.
- **Check requirements/cost/prompt composition** -> `run_action(generate_video, { dryRun: true, dryRunSummary: true })` for routine work; omit `dryRunSummary` when you need the exact full prompt body.
- **Generate** -> `start_job(generate_video)` after approval.
- **Make a non-destructive Shorts/alternate take** -> dry-run first with `run_action(generate_video, { dryRun: true, dryRunSummary: true, outputMode: "media_library", aspectRatio: "9:16", variantPurpose: "shorts" })`, then after approval call `start_job(generate_video)` with the same `outputMode`, `aspectRatio`, and `variantPurpose`. This saves a media-library take only; it does not replace the active shot video or render timeline.
- **Artist wants an in-flight video stopped** -> confirm, then `run_action(cancel_job, { projectId, jobId })`. It is a local cancel: the shot is freed, a request not yet sent is stopped for free, otherwise the provider keeps running and its output lands as a recoverable version, never the active video. Read the returned `runnerState` / `nextActions`; only `generate_video` jobs can be cancelled.
- **Previous provider outcome unknown/pending** -> do not retry until the artist acknowledges the risk; pass `acknowledgePreviousChargeRisk: true` only after that approval.
- **One exact final prompt needed** -> use `promptOverride` on `generate_video`.
- **One storyboard-video prompt segment is hurting one call** -> use `contextOverrides` on `generate_video` dry-run first, e.g. `{ includeShotBeat: false }` or `{ includeCutPlan: false }`, then generate only after the composition reads clean. If that decision should survive later Studio/agent regenerations, persist it with `apply_shot_prompts({ shots: [{ shotId, videoPromptSlots: { includeShotBeat: false, includeCutPlan: true } }] })`.
- **Storyboard video needs a different or extra reference image** -> use `contextOverrides` on `generate_video`, e.g. `{ includeEnvironmentRefs: ["start_env_id", "destination_env_id"] }`, `{ includeCastRefs: ["speaker_id"] }`, `{ includePreviousStoryboard: false }`, or `{ includeStyleImage: false }`. Dry-run first and confirm the `composition.images` list contains the intended refs before spending.
- **Need one-shot working state** -> `get_shot_context(projectId, shotId)`.
- **Need exact full payload text from last time** -> `run_action(describe_prompt, { kind: "video" })` for video, or `run_action(describe_prompt, { kind: "storyboard_render" })` for storyboard renders. `describe_video_prompt` is compatibility only.
- **Repeatable format needed** -> `run_action(list_workflows)`, then `run_action(apply_project_workflow)` if a named recipe fits. After that, fill the stored recipe's slots with `recipeSlots` and project dialogue; do not rewrite the wrapper.
- **Native dialogue voice needs character match** -> generate the raw native-audio clip first, review it, then use `voice_change_video` from the audio surface. Do not solve this with TTS unless the artist wants overlay.
- **Next shot chains from this shot's last frame (keyframe mode)** -> after the video lands, Sacred marks that next shot stale and lists it in `staleShotIds` / `nextActions`; it never rewrites its prompts. Check it with `get_shot_context` and save any new start-frame/motion text yourself with `run_action(apply_shot_prompts)`.
- **Board/frame wrong** -> return to storyboarding/keyframe tools before video.
- **Same failure twice** -> change model or upstream input, not just the same retry.

In storyboard mode, treat the active board as a black-and-white sketch plan by default: camera, choreography, staging, geography, screen direction, and beat timing. Final video style comes from the attached active references, when present, not from the board's paper/ink treatment. The shot beat (`shots.direction`) is excluded from storyboard-video prompts by default; rely on the active storyboard, explicit refs, and cut plan unless the beat contains essential content — opt it in per call with `contextOverrides.includeShotBeat=true`, or persist via `videoPromptSlots`.

For the music-video storyboard workflow, keep the final video full-frame and music-led. The recipe derives its music cue and duration from project state; do not rewrite its wrapper. The uploaded song remains the authoritative final audio; use source-audio lipsync only when a shot explicitly needs singing or mouth timing.

In storyboard mode, dry-run returns the composed prompt as segments: `format`, `animation`, `beat`, `refs`, `cut_plan`, `audio`, and `guardrail`. Prefer dropping a bad segment with `contextOverrides` for one call or `videoPromptSlots` for the saved shot default over hand-writing a full `promptOverride`.

## Native Audit Workers

Use a Codex/Claude native subagent or background worker for bounded video-adjacent audits that would bloat the main director context. Name the role in the packet: `Video Payload Auditor` for prompt/ref/audio contradictions, `Continuity Auditor` for cross-shot handoffs, `Candidate Triage Worker` for reroll review, or `Export Packaging Worker` for editor handoff. Sacred does not coordinate these workers; the harness does.

Use the native-worker packet/receipt contract from `docs/agent-working-method.md`. For video work, the packet should include target shots/assets, the exact question, payload summaries or selected `describe_prompt` output, preserve constraints, and forbidden writes/spend. The worker returns findings, caveats, and suggested next Sacred actions only. The main director remains responsible for dry-runs, paid `start_job` calls, imports, locks, and persisted edits.

## Repair Ladder

1. **Motion wording wrong** -> edit motion prompt.
2. **Board/frame wrong** -> fix storyboard or keyframe.
3. **Identity/location drift** -> fix active refs.
4. **Audio/lipsync issue** -> inspect audio plan and model family.
5. **Native voice wrong but mouth timing works** -> voice-change the video; for two speakers, pass explicit segment cut ranges.
6. **Model artifact/physics failure** -> one model switch test.
7. **Shot intent wrong** -> return to script/storyboard.

Every paid call in this skill uses `start_job(actionKey, input, idempotencyKey)`. Choose one stable 1-200 character key per artist-approved intent, reuse it only for transport retry of that exact action/input, and choose a new key for newly approved work. JSON-RPC request IDs are diagnostics, not retry identity.

## Ask Before

Always dry-run, state requirements/cost, then ask before `start_job(generate_video)`. For batches, summarize total shots and expected spend.

After `start_job`, return the job id and keep working unless the artist explicitly asks you to watch or poll. Studio realtime is the default progress surface; use `get_job` for deliberate checks/watch mode, not habit loops.

## Avoid

- Video generation before there is a usable board/frame.
- Long motion prompts that invent new styling.
- Retrying same model/prompt/refs after the same failure.
- Video-tuning a bad beat.
- Generating TTS before native-dialogue tests when the goal is visible regional-language lipsync.
