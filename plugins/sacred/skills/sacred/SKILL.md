---
name: sacred
description: Use for Sacred Studio projects: find sources, make Shorts or lyric videos, generate assets, render and request human review.
---

# Sacred

Sacred holds projects, assets, lineage, reviews and spend. In Claude Code use `mcp__plugin_sacred_sacred__<verb>`; in Codex, the `sacred` server.

## Verbs

| Verb | Use it to |
|---|---|
| `find` | Search lyrics, footage, assets, projects or models (`in: "models"`). |
| `open` | Read a project, song, asset or job. A new project is `save { project: { title } }`. |
| `fetch` | Download files for inspection. |
| `save` | Register a file or URL as an asset with lineage. |
| `render` | Render a document, FFmpeg spec or HyperFrames composition. |
| `make` | Generate or transform with a catalog model. |
| `batch` | Quote and submit up to 50 make/render items. |
| `ask` | Request human review or comment. |
| `wait` | Wait for jobs or human feedback. |
| `reply` | Answer comments with replacement assets. |
| `describe` | Read schemas and examples. |
| `pack` | Run older shot actions: `pack { actionKey, input }`. |

Use `describe` for unfamiliar inputs.

Render template bundles with `composition: { bundle: { uploadId }, assets?, output? }` and `template: { name, version }`; describe `render` for an example.

`find { in: "library", filters: { tags: ["taste"] } }` lists the taste library; use each entry's note and provenance to make work like it, and curate with `save { projectId, source: { assetId }, library: { label, tags, note } }`, tagging every entry `taste` plus one of `taste:template`, `taste:style`, `taste:technique`, `taste:reference`, `taste:winner`, and `template:<name>` when it demonstrates a template.

After the human posts a piece, record it with `publish`; never claim it was posted without the URL.
Read workspace post performance and style/format totals with `open { analytics: true, projectId, days: 28 }`; window views and lifetime metrics stay separate.

## The document

A cut document has `format`, `video`, subtitle `text` and `audio`. `render` compiles it to FFmpeg and saves it with its output. `describe { verb: "render" }` gives the schema. Preview a document with `render { document, preview: { at: [0, 5] }, projectId }` before rendering it, and inspect the contact sheet.

## The usual loop

1. `find` the song or moment (`kinds: ["lyric_line"]`, a meaning query; quote the original line next to its English meaning).
2. `open` the song for its subtitle handles, master audio, clip and sections. Prefer a chorus.
3. Write the document, `render` it, `fetch` the output and look at a few frames.
4. `ask` for review with the exact asset, then `wait`. Humans review work in the Project tab; `wait` returns their comments and decisions. Address comments, `reply` with the new version, and keep the same `slot` for revisions. Older unapproved versions expire 14 days after a newer version; new pieces get new slots.

On `timedOut`, repeat `wait` with the same ID. Never resubmit to wait.

## Spending

`make` costs money. Always quote first with `dryRun: true`.
- At or under $2, you may run it when the work calls for it.
- Above $2, show the human the quote (what, which model, cost) and run it only after their yes, passing `approvedQuoteId`.

Reuse an `idempotencyKey` only for the same intent. JSON-RPC request IDs are diagnostics, not retry identity. FFmpeg renders are fine to run.

Quote similar items with `batch dryRun` and get one yes above $2 total. Pilot one first when quality matters. Keep the batch key and item order on retries. Pass returned IDs to `wait` as `runIds` and/or `jobIds`.

## Rules

- A client's masters (Lahari audio, SRTs, clips) are fetch-only. Never save them back as new assets; reference their handles.
- Only lyrics with `engine` or `human_reviewed` timing are usable for lyric videos.
- Never approve your own work. Only humans approve.

## Sign-in

- Claude Code: `/mcp`, then Sacred, then Authenticate.
- Codex: `codex mcp login sacred`.
- CLI: `sacred login`.

On authentication failure, tell the human which sign-in to use. Never ask for tokens in chat. Account admission errors need a Sacred administrator.

## Craft

Read `lyric-video/styles/<style>/STYLE.md` for typography and pacing; `catalogue` is the usual style. Director skills cover the shot pipeline. For shot projects, use `pack` `preview_render`, then `render_project` with its `planHash` after human approval.
