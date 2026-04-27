---
name: Explore agent defaults to Sonnet
description: When spawning Explore subagents, pass model="sonnet" unless the task needs Opus-level reasoning
type: feedback
originSessionId: dc61d70d-547e-4839-938b-af48180a89d5
---
When launching an `Explore` subagent, pass `model: "sonnet"` explicitly. Only use Opus for exploration when the task genuinely requires deeper reasoning (e.g. reconstructing non-obvious semantic relationships across many files, not just locating/summarizing code).

**Why:** User flagged that I used Opus for a grounding-only exploration that Sonnet would have handled equally well — Opus on Explore wastes budget when the task is find/read/report.

**How to apply:** For any `Agent` call with `subagent_type: "Explore"`, default to `model: "sonnet"`. Same rule likely applies to `general-purpose` when used for lookups rather than design work. When in doubt (task involves synthesis, not just retrieval), stay on inherited/Opus.
