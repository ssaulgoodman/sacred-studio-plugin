# Sacred Plugin for Codex and Claude Code

Beta plugin for operating Sacred projects from Codex or Claude Code.

This plugin packages the Sacred MCP entrypoint and Sacred production skills so a beta artist can install Sacred once, connect their account, open a workspace folder, and ask their agent to run a video-production workflow. One folder serves both harnesses: `.codex-plugin/plugin.json` for Codex and `.claude-plugin/plugin.json` for Claude Code, sharing the same skills and `.mcp.json`.

The plugin and MCP server are named `sacred`. After upgrading from the old MCP key, authenticate once with `codex mcp login sacred` or Claude Code's `/mcp`. Existing server tokens and OAuth clients remain valid. The CLI keeps the old `mirage` command, `MIRAGE_*` client settings, and `~/.mirage/auth.json` as compatibility fallbacks. Project files still live under `mirage/projects/...`.

## What This Covers

- Remote Sacred MCP server declaration.
- Sacred operator skill for connect/open/sync habits.
- Node skills for concept, script, style, casting, sound, audio, storyboarding, and video.
- Starter prompts for opening a project, creating a persona clip, and creating a new video.
- Sacred icon and app metadata for the Codex plugin UI.
- A mocked Claude Code eval suite under `evals/` (engine repo only; not mirrored to the public plugin repo).

## Still Manual In This Beta

- Authentication is OAuth-first: install the plugin, then run `codex mcp login sacred` (Codex) or authenticate the Sacred server from `/mcp` (Claude Code). Sacred `/connect` handles the browser approval.
- Bearer-token setup from `/connect` remains a fallback for older clients that do not support MCP OAuth.
- Task-driven project sync and upload use the dependency-free Node 20 helper packaged beside the Sacred skill. The helper accepts short-lived project tokens only on stdin; `sacred sync` remains the compatibility fallback.
- Routine plugin work needs no workspace initialization: skills come from this plugin and action schemas come from live MCP. `sacred init` exists only with the standalone CLI fallback.
- The plugin-local bridge owns sync and Core API uploads without npm installation or a token-bearing shell command.

## Install Test

From macOS with Codex Desktop:

```bash
codex plugin marketplace add ssaulgoodman/sacred-studio-plugin --ref main --sparse .agents/plugins --sparse plugins/sacred
codex plugin add sacred@sacred
codex mcp login sacred
codex mcp get sacred --json
```

The plugin owns the Sacred MCP registration under the id `sacred`. Do not also add a separate global `codex mcp add sacred` entry; a global entry can shadow the plugin's OAuth registration and make new threads miss the Sacred tools. The login command opens Sacred `/connect` in the browser. Approve the request, then fully restart Codex and start a new thread in an empty Sacred workspace folder. Plugin skills and MCP config are loaded at session start.

For clients that do not support plugin-owned OAuth MCP, use the bearer-token snippet from Sacred `/connect` as a fallback.

For an ordinary update, preserve the installed plugin and its OAuth credential:

```bash
codex plugin marketplace upgrade sacred
```

Then fully restart Codex once. Do not remove and re-add the plugin during a normal update. Run `codex mcp login sacred` only when `codex mcp list` reports Sacred as not logged in.

## Claude Code Install

```bash
claude plugin marketplace add ssaulgoodman/sacred-studio-plugin
claude plugin install sacred@sacred
```

Inside Claude Code the same steps are `/plugin marketplace add ssaulgoodman/sacred-studio-plugin` and `/plugin install sacred@sacred`. Then start Claude Code in an empty Sacred workspace folder, run `/mcp`, select the Sacred `sacred` server, and choose Authenticate. It opens Sacred `/connect`; approve the request. Claude Code stores and refreshes the credential, so it persists across restarts. Sacred tools appear as `mcp__plugin_sacred_sacred__<tool>`.

For an ordinary update:

```bash
claude plugin marketplace update sacred
claude plugin update sacred@sacred
```

Then restart Claude Code once. Re-authenticate from `/mcp` only when it shows the Sacred server as needing authentication. Do not also add a separate `claude mcp add sacred` entry; the plugin owns the registration.

## CLI Fallback

The standalone CLI is not part of ordinary plugin install or update. Install it only when the packaged Node helper is unavailable and a task specifically needs the compatibility sync path:

```bash
npm install -g @ssaulgoodman420/sacred-cli@latest
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
