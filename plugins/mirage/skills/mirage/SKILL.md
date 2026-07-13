---
name: mirage
description: Use when connecting Codex to Sacred, opening or refreshing a Sacred workspace, choosing a project, syncing project files, uploading media, or explaining the Sacred operating loop.
---

# Sacred

Use Sacred as an agent-operated video studio. Help the artist move one Sacred project through concept, script, style, references, storyboards, video, audio, and render prep.

## Do This Now

Routine use is deliberately short:

1. Confirm Sacred MCP tools are visible under the `mirage` server id. If they are absent, stop. Do not fall back to browser control or local CLI project reads; ask the artist to fully restart the harness, then run `codex mcp login mirage` only if `codex mcp list` says Sacred is not logged in.
2. Call `open_project` directly with the project ID, the artist's title/query, or `latest: true`. It resolves and opens in one call. Use project/workspace lists only when the request is ambiguous.
3. Continue from the returned live state. Do not run doctor, package/version inspection, workspace init, or sync before ordinary project work.

Use `mirage_doctor` after install, plugin/server updates, deploys, authentication failures, or a real coherence problem. Initialize and sync the local workbench only when the task needs long editable files, payload traces, generation receipts, or handoff artifacts. Project sync is not part of attachment.

## Operating Contract

Sacred server/Supabase is canonical truth. Local files are the workbench: useful for reading, editing, diffing, generation traces, and handoff. A local file becomes production only when a Sacred apply action persists it.

Use Sacred MCP for project state, actions, paid jobs, locks, imports, uploads, issue capture, and coherence checks.

Bytes stay outside MCP. Upload local images/audio through `/api/agent/uploads` with the Sacred bearer token, then pass returned asset IDs into actions.

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

## Safe Edit Rule

Before visual assets exist, `apply_script` can create or rebuild broad topology.

After references, storyboards, or videos exist, use `apply_text_edits` for wording-only changes to existing scene titles, shot directions, or dialogue. Use `add_shot` / `delete_shot` for one-shot changes inside an existing scene. Keep `apply_script` for broad topology changes: scenes, cast, environments, multi-shot reorders, or re-IDing.

## Sync And Permissions

Project sync writes project files only. It should not rewrite skills, action schemas, `AGENTS.md`, or `CLAUDE.md`.

Install/update the Sacred CLI (`mirage`) without a live project token. MCP auth is OAuth-first: `codex mcp login mirage` opens Sacred `/connect` and the harness stores the MCP credential. This does not automatically log in the standalone `mirage` CLI.

For file sync, prefer the simplest available path: if the CLI is logged in, run `mirage sync <projectId>`; otherwise call `mint_cli_token` and run the returned short-lived sync command. Use `mirage login` only when the artist deliberately wants persistent CLI sync on that machine.

Use MCP file reads only when the harness has no shell or local file-write capability.

For local debugging, `mirage status` / `mirage doctor` is the file-level check. `mirage_doctor` is the remote coherence check. Use them only when onboarding or coherence is actually stuck, not as routine preflight.

## Media Uploads

For uploaded guides, references, audio, or native imagegen outputs:

1. Make sure `mirage auth status` is authenticated, or use `mint_cli_token` as a one-off fallback.
2. POST the file to `/api/agent/uploads` with the Sacred bearer token and correct `purpose`.
3. Use the returned `assetId` in the relevant action.

For native storyboard images, upload with `purpose=storyboard_image`, then call `import_storyboard_image` with the target `shotId`.

## Paid Work

Ask before paid generation. Prefer `dryRun` where available for cost and missing-requirement checks. Use `start_job` for paid image, storyboard, video, and audio generation, then return the job id and keep working unless the artist explicitly asks you to watch/poll. Studio realtime is the default progress surface; use `get_job` for deliberate checks, not habit loops.

If video generation returns provider outcome unknown, pending, or fetch/poll failed, do not retry immediately. Read the generation trace or attempt record, preserve the provider request ID if present, and ask the artist before acknowledging prior charge risk or starting another paid attempt.
