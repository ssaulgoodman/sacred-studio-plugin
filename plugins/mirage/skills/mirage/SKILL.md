---
name: mirage
description: Use when connecting Codex or Claude Code to Sacred, opening or refreshing a Sacred workspace, choosing a project, syncing project files, uploading media, recording external work, or explaining the Sacred operating loop.
---

# Sacred

Use Sacred as an agent-operated creative studio. A project holds a body of work with many outputs, including concepts, scripts, artwork, storyboards, video, audio, and renders.

## Do This Now

Routine use is deliberately short:

1. Confirm Sacred MCP tools are visible from the shared `mirage` server. Codex lists them under the `mirage` server id; Claude Code scopes the plugin's server, so they appear as `mcp__plugin_sacred_mirage__<tool>` (for example `mcp__plugin_sacred_mirage__open_project`). If they are absent, stop. Do not fall back to browser control or local CLI project reads; ask the artist to fully restart the harness, then log in only if the harness reports Sacred as not authenticated (see Authentication).
2. Call `open_project` directly with the project ID, the artist's title/query, or `latest: true`. It resolves and opens in one call. Use project/workspace lists only when the request is ambiguous.
3. Continue from the returned live state. Do not run doctor, package/version inspection, workspace init, or sync before ordinary project work.

Use `mirage_doctor` after install, plugin/server updates, deploys, authentication failures, or a real coherence problem. Initialize and sync the local workbench only when the task needs long editable files, payload traces, generation receipts, or handoff artifacts. Project sync is not part of attachment.

## Operating Contract

Sacred server/Supabase is canonical truth. Local files are the workbench: useful for reading, editing, diffing, generation traces, and handoff. A local file becomes production only when a Sacred apply action persists it.

Use Sacred MCP for project state, actions, paid jobs, locks, imports, issue capture, and coherence checks.

Bytes stay outside MCP. The plugin-local bridge sends local media to the Core asset endpoint, then returns asset IDs for actions.

## Local Workspace Shape

Workspace root:

- `AGENTS.md` and `CLAUDE.md` from `mirage init`
- `.mirage-workspace-state.json`
- no local `config/actions/*` requirement
- no synced `.agents/skills/*` requirement

Project files live under `mirage/projects/<projectId>/`:

- `state/` read-only snapshots
- `state/generation-traces/`
- `script.md`
- `audio-plan.md`
- `storyboards/*.md`
- project `config/`
- `journal.md`

Skills come from the installed Sacred plugin. Action schemas come from live MCP: call `describe_action(actionKey)` for the schema you are about to use.

For repeatable production formats, call `list_workflows` and apply the matching recipe with `apply_project_workflow`. The recipe is project data; fill its slots during generation instead of rewriting the wrapper from memory.

For recurring hosts or characters, use personas before asking the artist to re-upload identity. Call `list_personas` when the artist says "use Padma," "run this as Yapper," or "make a <persona> clip about <topic>." If the persona exists, call `create_project_from_persona` with the topic; it seeds character reference, style reference, voice fields, tone notes, and the persona's workflow recipe. Use `save_persona` only when the artist is setting up or updating a reusable identity from owned Sacred assets.

When the artist asks to reuse prior taste, characters, references, formats, or old outputs, call `query_artist_memory` for project-level memory and `search_artist_assets` for reusable asset IDs/URLs before asking them to re-explain it.

## One project, many outputs

Keep related outputs in the same project. Add or rearrange stages with `update_plan` for artwork, edits, formats, and deliveries within that body of work. Use `start_project_from` when selected content begins a distinct body of work: pass the current access `projectId`, a title, optional brief, and 1 to 200 library `assetIds`. It creates a normal Sacred project with your stages, or a default `sources` stage, and records the chosen sources without copying assets. Open the returned project ID to continue.

## The workspace library

The library is a view over every asset in the workspace, including assets from other projects and projectless logos, label artwork, or deity art. Discover the `kernel` surface with the current `projectId`, then use `run_action(search_library, { projectId, filters: { kinds: ["image"], labelContains: "logo" } })`. That project establishes access and workspace; it does not restrict results to its own assets. Projectless assets are included by default. Set `includeProjectless: false` to exclude them, and use `projectIds` to narrow project origins. Keep filters unchanged when passing `nextCursor` back as `cursor`.

Use each result's `reference.assetId` to seed work or record `derivedFrom` lineage. Producers can record reusable workspace content with `register_library_asset`, using an existing asset ID, committed git path, or durable unsigned URL, plus a label and optional tags. This records a projectless asset without transferring bytes. Any chosen library content can be a starting point. Lineage can cross projects within the workspace, never workspaces. `get_project_kernel` shows seed `sources` with their origin project and each asset's `usedBy` counts. These actions require `kernel_verbs`; describe them with `projectId` before use.

Use `run_action(search_media, { projectId, query: "calm figure beside oil lamps" })` to search indexed workspace files and catalogue material by meaning. Results are moments with exact file pointers and start/end times. Narrow by kind, project, language, deity, or song; use `like: { unitId }` for a similar moment. Use chosen moments as inputs to `render_media` or `render_composition`, preserving their source and time range. Thumbnail links expire after 15 minutes. Lyric moments carry every indexed script in `lines` and the model-written English `meaning` when available; quote the original line. Use `filters.textContains` for exact phrases, transliterating into the target script yourself, or browse a song's lines with `filters.songId` and no query; `like` skips the source unless `includeSameSource: true`.

## Recording any work in Sacred

For Lahari lyric videos and other catalogue work, use `run_action(get_catalogue_song)` with the current `projectId` and exactly one of `songId`, `isrc`, or title `query`. It requires Lahari access and `kernel_verbs`; ambiguous titles return candidates to choose from. Read the lyrics trust note, then download the SRTs, master audio, and assigned or chosen deity clip within 15 minutes. These files are the client's masters. Download them for the job and do not re-upload them as new library assets, except the clip and SRT actually used, which `register_asset` records as inputs. Never persist signed URLs or pass them to `register_asset`.

Without `surface`, `list_actions` returns one compact entry per enabled workspace-gated surface, including `kernel`, with `actionCount` and `detailTool`/`detailInput`. Follow that entry with `list_actions` to see individual actions, then use `describe_action` for full semantics and schemas. `count` counts index entries; each grouped entry carries its own action count. Disabled surfaces stay absent.

For a HyperFrames edit, Blender render, or code-made artwork, discover `list_actions({ projectId, surface: "kernel" })`, then `describe_action({ actionKey, projectId })`. These actions run through `run_action` when the workspace has `kernel_verbs` enabled. If disabled, report that limitation. `get_project_kernel` reads the live plan, asset versions, reviews, comments, deliveries, and spend.

Use `register_asset` when an output is ready to record. Reference an existing Sacred upload `assetId`, a committed git file, or a durable unsigned URL; the action neither uploads nor renders. Give it a stage, a stable logical `slot`, and exact `derivedFrom` inputs plus tool/model/payload where known. Unknown stages are added automatically. Use `log_step` for a meaningful progress note and `update_plan` when the work needs a new stage or order. The plan does not gate your work.

For example, add `hyperframes_edit` after the clips stage, register the composition from the workspace repo at its exact commit and project path, then register its render with the composition and clips as inputs. A Blender scene and render follow the same pattern using `kind: "model3d"` and `kind: "video"`. The upload bridge accepts video, images, audio, and private composition bundles. Use git or a durable unsigned URL for other external files. `paidCallId` may link only a call Sacred already recorded in the same workspace.

Use `request_review` for the exact asset versions the human should inspect. Read comments with `read_comments`, saving `nextCursor` with the same filters; recent comments appear after a two-second commit-lag window. A `reply_comment` with `addressedByAssetId` marks the thread addressed. Only humans resolve or dismiss it. Use `record_approval` only when the human explicitly decides in this conversation, and quote their words in `humanQuote`. Never approve your own work on your own initiative. Sacred attributes the relay to the authenticated human; an approved decision can pass its checkpoint. `declare_checkpoint` likewise requires the human's explicit instruction and quote.

Humans review work and leave project, asset, or timestamp comments in the web Project tab at `/?project=<projectId>&step=project`. Read those comments with `read_comments` before continuing the affected work, then reply in the same thread. `get_project_kernel.openReviews[].latestDecision` includes the latest decision note, including requested changes. Web decisions are already recorded; do not relay them again as a new approval.

`publish_deliverable` records delivery intent and exact assets; it does not send files. Pending publish checkpoints log `checkpoint_would_block` and allow the record in Phase 2. It has no rights checks and refuses `lahari_queue`, which belongs to the existing publish flow. Reuse idempotency keys or comment `clientMsgId` only for retries of the same intent.

Use `render_media` for plain media work such as subtitle burns, clip loops, trim, concat, scale, transparent overlays and audio muxing; use `render_composition` only for designed HyperFrames compositions. Pack the inputs and any `fonts/` as `.tar.gz`, upload with `purpose=composition_bundle`, and pass `{ projectId, bundle: { uploadId }, args, output }` through `run_action`. Args are FFmpeg options without an executable or output path; use bundle-relative files and `subtitles=lyrics.ass:fontsdir=fonts` or `ass=lyrics.ass:fontsdir=fonts`. Pass Sacred `inputs` for lineage. Each call starts compute, so retain `runId` and use `get_runner_status` after approval instead of retrying uncertain work. `render_media.assets` fetches up to 20 available workspace assets through short-lived data-home URLs, records their lineage, and supports `-ss`/`-t`/`-to` before `-i`; omit the bundle for plain trims, keeping subtitles and fonts in a bundle. `search_media` with `filters: { songId, finalVideo: true }` finds a song's finished video through its indexed job metadata. `get_catalogue_song.structure` returns model-written musical sections with start/end seconds, energy and description, or null, to help choose a chorus for a Short.

## Preview and render a HyperFrames composition

Package the composition contents with `tar -czf /tmp/composition.tar.gz -C <composition-folder> .` so `index.html` is at the archive root. Include the media files it uses. Bundles are limited to 500 MiB compressed and expanded, with no links or traversal paths. Use the sibling upload bridge with `--purpose composition_bundle`, passing a minted project token through stdin as described below. It sends the archive to `/api/agent/uploads` and returns `uploadId`; this upload path does not deduplicate retries.

Each upload is a version. After uploading the composition folder as `.tar.gz` with `purpose=composition_bundle`, register it with `register_asset` using `kind: "composition"`, `source: { uploadId }`, a stage and a stable slot. Tell the human it is ready to watch on the project page. Read `read_comments`, including `tStartSec` and `tEndSec`, edit the composition, and upload a new bundle. Register that new asset with `derivedFrom` pointing to the previous bundle version. Use the same stage and slot for its rendered MP4 so both Live preview and Rendered appear together. Only call `render_composition` after the human approves rendering that version.

Discover and describe `render_composition` on the `kernel` surface, then call `run_action` with `{ projectId, bundle: { uploadId }, stage: "render", slot: "edit:main", inputs: [{ assetId: "<clip-id>", role: "source_clip" }] }`. List all clips, audio, and other Sacred assets used by the composition. Sacred adds the bundle to lineage automatically. This starts billable Modal compute through `run_action`, not `start_job`. Each call starts a new run, so keep the returned `runId` and poll `get_runner_status` deliberately instead of retrying the render. The output appears on the project's Project tab. Optional `output.fps` sets render frame rate; even `width` and `height` scale the MP4 after rendering. Omit dimensions to preserve the composition size.

## Safe Edit Rule

Before visual assets exist, `apply_script` can create or rebuild broad topology.

After references, storyboards, or videos exist, use `apply_text_edits` for wording-only changes to existing scene titles, shot directions, or dialogue. Use `add_shot` / `delete_shot` for one-shot changes inside an existing scene. Keep `apply_script` for broad topology changes: scenes, cast, environments, multi-shot reorders, or re-IDing.

## Sync And Permissions

Project sync writes project files only. It should not rewrite skills, action schemas, `AGENTS.md`, or `CLAUDE.md`.

## Authentication

MCP auth is OAuth-first. Both harnesses open Sacred `/connect`, where the artist approves the connection, and then store and refresh the credential themselves. That harness credential is not exposed to local scripts.

- Codex: `codex mcp login mirage`; check status with `codex mcp list`.
- Claude Code: run `/mcp`, select the Sacred `mirage` server, and choose Authenticate.

If a Sacred call fails because authentication is missing, expired, or revoked, the harness normally refreshes on its own. If it still fails, stop Sacred work, tell the artist Sacred needs to reconnect, and give them the one step for their harness above. Do not retry paid actions, switch to browser control, mint tokens as a workaround, or ask for a bearer token in chat. An access error (account not admitted or suspended) is different: logging in again will not fix it, so tell the artist to contact a Sacred administrator.

## Local Sync Tokens


For task-driven sync or upload, call `mint_cli_token`, resolve `scripts/bridge.mjs` next to this loaded `SKILL.md` to an absolute path, and invoke that absolute sibling path. Start the process with `--token-stdin`, write the short-lived token only to the child process stdin, then close stdin. Never place the token in argv, a shell pipe/command string, environment variables, files, logs, errors, or lock metadata.

Commands:

```text
node "/absolute/path/to/loaded/skills/mirage/scripts/bridge.mjs" sync --project <id> --profile <full|state|payloads> --token-stdin
node "/absolute/path/to/loaded/skills/mirage/scripts/bridge.mjs" upload --project <id> --purpose <purpose> --file <path> [--entity <id>] [--new-upload] --token-stdin
```

Use the full profile for editable drafts/config, `state` for state snapshots, and `payloads` for prompt receipts. `--new-upload` means the artist deliberately wants another asset from identical bytes; ordinary retries omit it and reuse deterministic upload identity. Add `--base-url <url>` only for an explicitly configured non-production Sacred server. The standalone `mirage sync` CLI remains the fallback when the plugin helper is unavailable; do not install or log into it as routine plugin preflight.

Use MCP file reads only when the harness has no shell or local file-write capability.

For local debugging, `mirage status` / `mirage doctor` is the file-level check. `mirage_doctor` is the remote coherence check. Use them only when onboarding or coherence is actually stuck, not as routine preflight.

## Media Uploads

Bring outside videos, images or audio into the matching project with `bridge.mjs upload --purpose media`, then call `register_asset` with `source: { uploadId }`, a stage, label and stable slot. The upload supports up to 500 MiB and returns its sniffed kind and SHA-256. Include exact `derivedFrom` inputs with `usedStartSec` and `usedEndSec` when known, and `payload` facts such as `posted`, `platform` and `url`. Reuse the registration `idempotencyKey` for retries. This works for native Lahari kernel projects with producer access and `kernel_verbs`.

For uploaded guides, references, audio, or native imagegen outputs:

1. Call `mint_cli_token` for the target project.
2. Invoke the absolute plugin sibling `scripts/bridge.mjs upload` path with the correct purpose and pass the token only through child stdin.
3. Use the returned `assetId` in the relevant action.

For native storyboard images, upload with `purpose=storyboard_image`, then call `import_storyboard_image` with the target `shotId`.

## Paid Work

Ask before paid generation. A request to make, generate, or get paid work going is not by itself approval to spend: approval is the artist's yes after seeing what the spend covers (from a dry run or estimate), or an explicit spend approval in their message such as "I approve the storyboard spend". This applies equally to storyboards, images, video, and audio. Until then, do the free work (author and save prompts, dry-run) and ask. Prefer `dryRun` where the live action spec explicitly supports it for cost and missing-requirement checks. Every `start_job` call requires one stable 1-200 character `idempotencyKey` for that artist-approved paid intent; reuse it only for transport retry of the exact same action/input, and choose a new key for newly approved work. JSON-RPC request IDs are diagnostics, not retry identity. Use `start_job` for paid image, storyboard, video, and audio generation, then return the job id and keep working unless the artist explicitly asks you to watch/poll. Studio realtime is the default progress surface; use `get_job` for deliberate checks, not habit loops.

If video generation returns provider outcome unknown, pending, or fetch/poll failed, do not retry immediately. Read the generation trace or attempt record, preserve the provider request ID if present, and ask the artist before acknowledging prior charge risk or starting another paid attempt.

## Final Render

Agents can render without the browser.

1. `run_action(preview_render, { projectId })` shows the cut that would render. When the artist has saved a timeline in the web Render page, that saved cut is used, updated to each shot's current video. Otherwise Sacred builds the default cut: active shot videos in script order, hard cuts, over the project song. In the default cut the song stops at the last clip, and it starts at the first rendered scene's song-section start on music-led projects, else at 0:00. The preview lists missing shots, stale shots it left out, the audio source and song window (`audio.window`), total duration, any song tail with no picture, the likely engine, blockers (for example missing TTS overlay lines), and a `planHash`.
2. Show the artist the cut and get a yes. A completed render becomes the project's final render and marks the project completed; for Lahari queue projects it also publishes back to the queue row.
3. `run_action(render_project, { projectId, planHash })` with the same options as the preview (`useSavedTimeline`, `includeUnapproved`, and any audio window options; they are part of the hash). `planHash` is required. It is renderer compute, not provider spend, so it runs through `run_action`, not `start_job`, and returns a `renderId`. A changed timeline is refused with `render_plan_changed`; preview again. A second render while one is running is refused with `render_already_running`.
4. `run_action(get_render_status, { projectId, renderId })` for a deliberate check: status, progress, stage, engine, error code, and the final video URL. `get_job` does not cover renders. Do not poll in a loop.

Options: `useSavedTimeline: false` ignores the saved cut; `includeUnapproved: true` includes shots whose active video is stale.

Song window (default cut only): when the cut covers part of the song, check `audio.window` in the preview. `audioStartMs` sets where in the song the cut begins (a cut set to 0:31-1:39 is `audioStartMs: 31000`). The song ends at the last clip by default; `audioEndMs` ends it at a set point instead, and `trimToPicture: false` plays the whole song (black frames after the last clip). A saved timeline keeps its own audio trim and ignores these options; pass `useSavedTimeline: false` to apply them. Trims, transitions, effects, and extra media on a saved cut are edited by the artist in the web Render timeline.
