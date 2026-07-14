---
name: storyboarding
description: Use when writing, generating, repairing, or importing Sacred storyboards. Covers multi-panel board prompts, cut plans, reference-aware staging, context fixes, image refine, native image import, and cross-shot coherence.
---

# Storyboarding

You write multi-panel storyboard prompts for one Sacred shot. A board is a visual plan for video generation: blocking, geography, character positions, and action beats.

Sacred renders the prompt with the active style, character, and environment references. Use exact project names for those references; Sacred binds those names to the attached images at render time. Describe what happens in the shot; only add appearance/style detail when correcting a specific failure.

## First Move

Start with `get_shot_context(projectId, shotId)` when available. It shows the shot direction, assigned cast/environment, active refs, current board state, latest storyboard render payload summary, video payload summary, and exact edit paths without loading full prompt bodies. If no draft exists, write from the shot. If fixing a generated board, inspect its actual pixels with `review_storyboard` before guessing; use `run_action(generate_storyboard, { dryRun: true })` to preview the exact next storyboard render payload before spending, and use `describe_prompt({ kind: "storyboard_render" })` only when you need exact text from an already-generated board.

## Sequential Scene Loop

Build a spatially coherent scene one shot at a time. Do not batch-write all cut plans from script text.

1. Write the current shot's storyboard prompt with `run_action(apply_storyboard_prompts)`. At this stage, persist the prompt only.
2. After storyboard spend is approved, generate the board with `start_job(generate_storyboard)`.
3. When the job completes, call `review_storyboard` and inspect the returned image pixels. Check staging, geography, continuity, action progression, and the shot's ending state.
4. If the board is wrong, repair the prompt or use a narrow image refine, regenerate, and inspect again. Do not compensate for a bad board in the cut plan.
5. Once the board is good, write the cut plan from what is actually visible and save it with `run_action(apply_storyboard_cut_plan)`, passing the active storyboard version ID returned by `review_storyboard`.
6. Move to the next shot. Use the previous board already visible in conversation as continuity context. Set `includePrevious: true` only after a resumed or compacted session when those pixels are no longer in context.

Finish the boards and cut plans for the scene, share the Studio review link, and stop for artist approval before starting any video generation. Independent scenes may be prepared in parallel, but shots that share geography or continuous action should follow this sequence.

## Prompt Pattern

1. **Layout:** choose a 2×2 (4 panels) for most shots or 2×3 (6 panels) for a longer beat. Panels read left-to-right, top-to-bottom.
2. **Setup:** one sentence naming the location and present characters by project name.
3. **Panels:** one clear action moment per panel. Format: `Panel 1: <framing/staging> — <visible action>`.
4. **Continuity:** one sentence naming what must stay consistent: positions, screen direction, light, prop placement, doorway, or room geography.
The saved board prompt is a shot plan, not an image-render contract. Sacred's renderer applies the black-and-white sketch-board treatment, reference binding, and no-visible-text rules automatically. Active references still carry identity and geography; final video style comes later from the attached active style/cast/environment references, when present.

Keep the prompt under ~220 words. Make the board easy to understand at a glance: clear staging, visible action, readable positions, and sensible geography.

Example:

> A 2×2 grid of four panels, read left-to-right then top-to-bottom.
> Setup: The Boss enters the Red Den Room; The Knife Orchid is already seated.
> Panel 1: wide doorway view — The Boss stops at the threshold, one hand on the frame.
> Panel 2: medium over his shoulder — The Knife Orchid stays seated, watching without turning.
> Panel 3: close on The Boss — his eyes find the empty desk.
> Panel 4: wide reverse — he crosses toward the desk; she has not moved.
> Keep the doorway, desk, and seated position consistent across all panels.

## Framing Language

Write panel framings in standard shot terms. Scale: extreme wide, wide, medium wide, medium, medium close-up, close-up, extreme close-up, insert. Angle, only when it changes meaning: eye-level, high, low, overhead, over-the-shoulder, POV, Dutch. Stage geography with composition words: leading lines, negative space, foreground framing, deep staging, silhouette. Every panel framing needs a job — establish geography, reveal information, isolate emotion, follow action, or land a beat. No lens or rig jargon in boards.

## Cut Plan

The cut plan is post-board motion direction. Write it only after seeing the rendered board, and describe how the visible panels become a coherent clip. Keep it as detailed as the motion requires; there is no one-line or terseness rule.

Address the relevant panels and include only what helps execution: camera movement or hold, visible subject action, position and contact continuity, performable emotion or gesture, progression between beats, and the intended ending or handoff state. Plain directions such as `cut to wide as she rises`, `track with him crossing the room`, or `hold on the close-up until her hand releases` are useful. No timestamps, lens specifications, or rig jargon unless a model-specific repair truly requires them.

The board is the spatial truth. If an action, position, or transition is absent or contradicted in the image, fix the board rather than inventing it in the cut plan. An empty plan is valid only when the artist deliberately chooses board-order-only motion.

## Sketch Planning

Sketch planning is Sacred's canonical storyboard technique. The default renderer produces monochrome planning boards, and GPT Image 2 is the default storyboard provider. For music-led projects, discover and apply the music-video storyboard workflow with `list_workflows` and `apply_project_workflow`; it adds music-section and video-format defaults on top of the same board base. Treat final-style boards as a deliberate override.

## Check The Board

Before video generation, check whether the board actually stages the shot:

- each panel shows a distinct moment
- action progresses logically from panel to panel
- character positions and room geography make sense
- adjacent shots preserve screen direction and handoff state
- framing varies enough that the scene does not become repeated centered portraits

## Repair Ladder

1. **Written beat is wrong** → edit `storyboards/<scene>.md`, then `run_action(apply_storyboard_prompts)`. Free.
2. **No board exists yet** → `run_action(generate_storyboard, { dryRun: true })` to inspect the exact prompt/refs, then `start_job(generate_storyboard)` after approval. Video generation auto-approves the active board version it uses.
3. **The board premise is wrong** → fix the saved prompt first with `apply_storyboard_prompts`, then regenerate after approval.
4. **Board is close, one visual detail is wrong** → `start_job(refine_storyboard_image)` with a narrow edit instruction.
5. **Wrong refs/context are attached** → dry-run with `contextOverrides` to exclude/swap refs, style image, or previous-board context; generate only after the payload shows the intended refs.
6. **Native or artist image is better** → upload with `purpose=storyboard_image`, then `run_action(import_storyboard_image)`.
7. **A repeatable phrasing works** → promote it with `apply_project_style_notes` in the storyboard bucket or a project prompt override.

## Native Image Workers

Use a Codex/Claude native subagent or background worker named `Image Repair Worker` when a board/keyframe needs precise imagegen repair and the iteration would bloat the main director context. The worker is a harness-native helper, not a Sacred actor.

Use the native-worker packet/receipt contract from `docs/agent-working-method.md`. For storyboard work, the packet should include the target shot, current board/keyframe image, exact repair, preserve constraints, allowed tool (`imagegen` or local inspection), and the intended import path. The worker should not call paid Sacred jobs, lock/unlock, edit project text, or write Supabase state.

The receipt must say whether the result is import-ready and include the final image path, prompt used, changes made, caveats, and suggested Sacred action. The main director then shows the result if needed, uploads it with `purpose=storyboard_image` or `purpose=keyframe_image`, and calls `import_storyboard_image` or `import_keyframe_image`. Video generation will record the active board version it uses.

After a storyboard `start_job`, return the job id and avoid busy polling. Studio realtime is the default progress surface. This workflow has a real dependency, however: once completion is visible, use one deliberate `get_job` check if needed, then call `review_storyboard`; do not move to the next continuity-dependent shot before inspecting the board.

Keep `gpt-image-2` as the storyboard provider unless the artist explicitly asks to test another model or GPT Image 2 fails repeatedly with a clear provider-specific issue.

## Avoid

- 3-panel or 3×3 boards; Sacred's canonical renderer supports 2×2 and 2×3 plans.
- Visible panel numbers, labels, captions, arrows, speech bubbles, subtitles, readable text, logos, or watermarks.
- Rewriting faces, outfits, environments, or style when active references already carry them.
- Vague mood/style language without visible staging.
- Overpacking one board; split into adjacent shots when four or six panels cannot stage the action clearly.
