# Sacred Codex Plugin

Beta plugin for operating Sacred projects from Codex.

This plugin packages the Sacred MCP entrypoint and Sacred production skills so a beta artist can install Sacred once, connect their account, open a workspace folder, and ask Codex to run a video-production workflow.

Compatibility note: the product is Sacred, but the current plugin id, MCP server id, CLI command, and local project path still use `mirage`. Keep those names until the engine ships explicit `sacred` aliases.

## What This Covers

- Remote Sacred MCP server declaration.
- Sacred operator skill for connect/open/sync habits.
- Node skills for concept, script, style, casting, sound, audio, storyboarding, and video.
- Starter prompts for opening a project, creating a persona clip, and creating a new video.
- Sacred icon and app metadata for the Codex plugin UI.

## Still Manual In This Beta

- Authentication is OAuth-first: install the plugin, then run `codex mcp login mirage`. Sacred `/connect` handles the browser approval.
- Bearer-token setup from `/connect` remains a fallback for older clients that do not support MCP OAuth.
- Task-driven project sync and upload use the dependency-free Node 20 helper packaged beside the Mirage skill. The helper accepts short-lived project tokens only on stdin; `mirage sync` remains the compatibility fallback.
- Routine plugin work needs no workspace initialization: skills come from this plugin and action schemas come from live MCP. `mirage init` exists only with the standalone CLI fallback.
- The plugin-local bridge owns sync and Core API uploads without npm installation or a token-bearing shell command.

## Install Test

From macOS with Codex Desktop:

```bash
codex plugin marketplace add ssaulgoodman/sacred-studio-plugin --ref main --sparse .agents/plugins --sparse plugins/mirage
codex plugin add mirage@mirage
codex mcp login mirage
codex mcp get mirage --json
```

The plugin owns the Sacred MCP registration under the technical id `mirage`. Do not also add a separate global `codex mcp add mirage` entry; a global entry can shadow the plugin's OAuth registration and make new threads miss the Sacred tools. The login command opens Sacred `/connect` in the browser. Approve the request, then fully restart Codex and start a new thread in an empty Sacred workspace folder. Plugin skills and MCP config are loaded at session start.

For clients that do not support plugin-owned OAuth MCP, use the bearer-token snippet from Sacred `/connect` as a fallback.

For an ordinary update, preserve the installed plugin and its OAuth credential:

```bash
codex plugin marketplace upgrade mirage
```

Then fully restart Codex once. Do not remove and re-add the plugin during a normal update. Run `codex mcp login mirage` only when `codex mcp list` reports Sacred as not logged in.

## CLI Fallback

The standalone CLI is not part of ordinary plugin install or update. Install it only when the packaged Node helper is unavailable and a task specifically needs the compatibility sync path:

```bash
npm install -g @ssaulgoodman420/mirage-cli@0.1.15
```

The first useful prompt after install is:

```text
Open my latest Sacred project.
```

Codex should call `open_project` directly. It should not run doctor, inspect package versions, initialize a notebook, or sync files before ordinary project work. Doctor is for install/update/deploy or real failures; local sync is only for tasks that need long editable files, payload traces, or handoff artifacts. Project sync should not require a fresh chat; a fresh chat is only needed after installing or updating the plugin.

For recurring formats like Yapper, Codex should call `list_personas` and `create_project_from_persona` when the artist asks for a saved host/persona such as Padma, instead of asking for the same reference image, style, or voice id again.

If a paid provider call returns outcome unknown, Codex should inspect the generation trace/attempt before retrying. Do not spend again until the prior provider request is reconciled or the artist explicitly accepts the charge risk.

## Beta Onboarding Goal

The artist experience should become:

1. Install Sacred plugin.
2. Connect Sacred with the email Saul assigned.
3. Open a local workspace folder.
4. Ask Codex: "Open my Sacred project" or "Start a new Krishna podcast episode."

The plugin should make Sacred feel like an installed production surface, not a pile of copied instructions.
