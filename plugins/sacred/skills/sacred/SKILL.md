---
name: sacred
description: Use for any work in Sacred Studio, the agent-operated video studio: finding songs, lyric moments and footage, making Shorts, lyric videos and generated media, rendering, and putting work up for human review.
---

# Sacred

Sacred holds the work: projects, assets and their lineage, reviews, comments and spend. You do the work with a few verbs and your own shell. In Claude Code the verbs appear as `mcp__plugin_sacred_sacred__<verb>`; in Codex, under the `sacred` server.

## Verbs

| Verb | Use it to |
|---|---|
| `find` | Search by meaning or filter: lyric lines, video moments, assets, projects, models (`in: "models"`). Hits carry handles. |
| `open` | Get a compact view of a project, catalogue song, asset or job. |
| `fetch` | Download a file. Look at real frames before you show anyone. |
| `save` | Register a file or URL as an asset with kind, slot and lineage. A local file returns an upload URL and the follow-up call. |
| `render` | Render a document (below) to a file. |
| `make` | Generate or transform with a model from the catalog: image, video, voice, lipsync, edit, upscale. |
| `ask` | Put asset versions up for human review, or comment. |
| `wait` | Wait for a job, or for the human's comments or decision. |
| `reply` | Answer a comment; mark it addressed by a new version. |
| `describe` | A verb's or model's full input schema and an example. |
| `pack` | The door to the older shot pipeline (storyboards, shots, keyframes). When a craft skill names an action such as `generate_storyboard`, call `pack { actionKey, input }`. |

When unsure of an input, call `describe` first; it's cheap.

## The document

A Short or lyric video is a JSON document: `format`, `video` clips, `text` lines from a subtitles handle in a named style, and `audio`. `render` compiles it to FFmpeg. To revise, change the field and render again; every render keeps its document, and `open` on the job returns it. `describe { verb: "render" }` has the full shape.

## The usual loop

1. `find` the song or moment (`kinds: ["lyric_line"]`, a meaning query; quote the original line next to its English meaning).
2. `open` the song for its subtitle handles, master audio, clip and sections. Prefer a chorus.
3. Write the document, `render` it, `fetch` the output and look at a few frames.
4. `ask` for review with the exact asset, then `wait`. Humans review work and comment on the project page, in the Project tab; `wait` returns their comments and decisions. Address comments, `reply` with the new version, and keep the same `slot` so versions stack.

Long jobs (`render`, `make`) may come back as a task or with `timedOut`. Call `wait` with the same id until they finish. Never start the job again to wait for it.

## Spending

`make` costs money. Always quote first with `dryRun: true`.
- At or under $2, you may run it when the work calls for it.
- Above $2, show the human the quote (what, which model, cost) and run it only after their yes, passing `approvedQuoteId`.

Give each paid intent one stable `idempotencyKey` and reuse it only to retry that exact intent; JSON-RPC request IDs are diagnostics, not retry identity. FFmpeg renders are fine to run.

## Rules

- A client's masters (Lahari audio, SRTs, clips) are fetch-only. Never save them back as new assets; reference their handles.
- Only lyrics with `engine` or `human_reviewed` timing are usable for lyric videos.
- Never approve your own work. Only humans approve.

## Sign-in

- Claude Code: `/mcp`, then Sacred, then Authenticate.
- Codex: `codex mcp login sacred`.
- The CLI: `sacred login`, which opens the browser.

If Sacred calls fail on authentication, stop and tell the human which of these to run. Never ask for tokens in chat. An access error (account not admitted) needs a Sacred administrator, not a new login.

## Craft

The `lyric-video` skill and its `styles/` folder hold the house looks; read a style's `STYLE.md` before choosing type, placement or pacing. `catalogue` is the usual lyric style. The director skills cover the shot pipeline behind `pack`. A shot-pipeline project's final cut is `pack` `preview_render`, then `render_project` with the preview's `planHash` after the human's yes.
