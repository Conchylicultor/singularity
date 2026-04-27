---
name: Understand the why before implementing
description: Always seek to understand the reasoning and context behind design decisions before implementing
type: feedback
---

Don't assume domain knowledge can be skipped just because the user has prior experience. Always seek to understand the "why" behind features and design choices — the user's v1 experience means there are important considerations that aren't obvious from the code alone, and missing them leads to flawed implementations.

**Why:** User has deep context from building v1 that informs architectural and design decisions. Without understanding that context, implementations may miss critical considerations.

**How to apply:** During planning phases, ask about motivations, constraints, and lessons learned from v1. Don't shortcut the design discussion even when the user seems confident about what they want.
