# Research Plan — What to investigate

## Open questions

This sidequest sits at the intersection of design knowledge and LLM capability. We need to answer questions in both areas before we can build anything useful.

---

## Track 1: Can LLMs judge UI quality?

This is the foundational question. If agents can't tell good from bad, no amount of design principles will help — they'll apply rules mechanically without understanding the result.

### Questions to answer

- **Pairwise comparison**: Given two screenshots of the same UI (one polished, one rough), can an LLM reliably pick the better one? How consistent are they across runs?
- **Defect detection**: Given a single screenshot, can an LLM enumerate specific visual problems (misalignment, inconsistent spacing, poor contrast, clutter)?
- **Severity ranking**: Can they distinguish "slightly off" from "clearly broken"?
- **Taste vs. rules**: Do they judge based on learned heuristics (centered = good) or actual visual perception? Can they be fooled by "technically correct but ugly" UI?
- **Model differences**: Do different models (Opus, Sonnet, Haiku) have meaningfully different visual judgment?

### How to test

- Collect pairs of UI screenshots (same app, different quality levels)
- Build a simple evaluation script that presents pairs to the model and asks which is better and why
- Measure agreement with human judgment, consistency across runs, quality of explanations
- Test with progressively subtler differences to find the threshold

### What to search for

- Research on VLM (vision-language model) capabilities for UI understanding
- Papers on automated UI evaluation / aesthetics scoring
- Existing tools: UI linting, visual regression, design system compliance checkers
- HCI research on what makes UI "feel" professional (measurable qualities)

---

## Track 2: What makes UI professional?

Collect and distill design knowledge, optimized for agent consumption.

### Areas to research

#### Inspiration / Reference apps
- **Dev tools**: Linear, Vercel, Raycast, Superhuman, Figma, Notion, Arc
- **What to extract**: Not just "it looks nice" but specific measurable properties — spacing scales, color counts, typography ratios, animation timing, information density
- **Method**: Screenshot + annotated teardown for each

#### Design systems & guidelines
- Tailwind UI patterns and conventions
- shadcn/ui advanced usage (beyond defaults)
- Apple HIG, Material 3 — not to follow, but to understand the reasoning
- Refactoring UI (Adam Wathan/Steve Schoger) — pragmatic design for developers

#### Specific topics to deep-dive
- **Typography**: Scale ratios, line height, font weight usage, when to use tracking
- **Color**: Minimum viable palette, dark mode color math, accent usage ratios, OKLCH for perceptual uniformity
- **Spacing**: 4px/8px grids, padding/margin relationships, optical alignment vs. mathematical alignment
- **Visual hierarchy**: How the eye scans a page, creating layers without borders, subtle depth cues
- **Polish details**: Transitions (timing, easing), hover states, focus rings, loading states, empty states, micro-interactions
- **Information density**: When to add whitespace vs. when density signals professionalism (Linear vs. Apple)

#### Tutorials / learning resources
- Refactoring UI book/videos
- Steve Schoger's design tips (Twitter threads, now compiled)
- Tailwind CSS best practices for visual quality
- "Design for developers" resources
- YouTube channels: DesignCourse, Juxtopposed, etc.

---

## Track 3: Auditing methodology

How does a polish agent systematically evaluate and improve a UI?

### Questions to answer

- What's the "unit test for UI"? Can we define a checklist that's mechanical enough for agents?
- Visual regression testing — can we diff screenshots to catch regressions?
- Should we use Playwright + screenshots as a CI-style check?
- Can we score a UI on specific axes (hierarchy, consistency, density, polish) and track improvement?

### What to build (eventually)

- An audit template: structured checklist an agent fills out when reviewing UI
- A screenshot comparison tool: take before/after screenshots, present to model for judgment
- A "design lint" concept: rules that can be checked programmatically (contrast ratios, spacing consistency, font size count)

---

---

## Track 4: How code structure enforces design

Design consistency isn't just a knowledge problem — it's an architecture problem. If the stack lets any component invent its own spacing, colors, or typography, inconsistency is the default outcome. Agents, working in parallel across plugins, make this worse: each one happily writes `className="p-3 bg-gray-800 text-sm"` with slightly different values than the last.

The core hypothesis: **the code structure should make the right thing easy and the wrong thing hard or impossible.**

### Questions to answer

#### Folder structure

- Should plugins be allowed to define styles at all, or only consume centralized primitives?
- Current state: plugins import from `web/src/components/ui/*` (shadcn), but they also write raw Tailwind classes inline. This distributes design decisions across the entire codebase.
- Proposal to evaluate: a centralized `design-system/` (or similar) package that exports *only* composed, opinionated components. Plugins never write raw `className` for layout/color/typography — they only compose from primitives.
- What's the right boundary? Tokens only? Primitives only? Full component lockdown?
- How do we handle legitimate plugin-specific styling (e.g. a plugin-specific visualization) without reopening the door to inconsistency?

#### Stack choice

Doubts about Tailwind + shadcn:
- **Tailwind**: Utility classes mean every component redefines its own spacing/color choices. "Consistency" relies entirely on developer discipline. No type system catches `p-3` in one place vs `p-4` in another.
- **shadcn**: Components get copied into the project, then diverge. There's no upstream to enforce consistency. Agents edit them freely.
- Both were designed for maximum flexibility, which is the opposite of what we want: maximum *constraint*.

Alternatives to investigate:

- **CSS variables + restricted primitives**: Keep Tailwind for layout only, but forbid arbitrary color/spacing classes. All visual tokens come from CSS custom properties. Enforced via lint rules.
- **Panda CSS / vanilla-extract**: Typed design tokens at build time. `<Box padding="md" />` where `"md"` is a typed token — impossible to use a wrong value.
- **Stitches / styled-system era libraries**: Constrained prop-based APIs (`<Text size={2} color="muted" />`).
- **Radix Themes / Mantine / Chakra**: Opinionated out-of-the-box systems. Less flexibility, more consistency.
- **Pure CSS with a tiny primitive library**: Hand-rolled `<Stack>`, `<Text>`, `<Button>` that accept only enumerated token props. Minimal, but maximum control.

Each alternative has tradeoffs: ergonomics, bundle size, agent-writeability, ability to express edge cases.

#### Enforcement mechanisms

Beyond folder structure and stack choice, what mechanical rules keep agents honest?

- **Lint rules**: Ban raw color values, ban `style={}`, restrict which Tailwind classes are allowed
- **Type system**: Make the primitive API the only way to produce styled output
- **Review tooling**: Automated checks that flag new `className` strings in PRs
- **Design tokens as single source of truth**: Tokens defined once (colors, spacing, radii, shadows, typography), consumed everywhere. Changing a token updates the whole app.

#### Agent-specific considerations

- How do agents discover the design system? A top-level `DESIGN.md` they must read before touching UI?
- Can we make the design system *self-describing* — primitives expose their API in a way agents can introspect?
- Does the CLAUDE.md convention help, or do we need in-code affordances (JSDoc, strict types) that steer agents at write time?

### What to search for

- "Design tokens" best practices and tooling (Style Dictionary, W3C design tokens spec)
- Critiques of Tailwind for design consistency (there are many — worth reading both sides)
- How companies with strong design systems (Linear, Stripe, GitHub Primer) structure their code
- Research on "constrained design APIs" — why Figma's components feel consistent vs. Sketch's
- Typed CSS-in-JS libraries and their tradeoffs

### Deliverable

A proposal doc recommending:
1. A folder/package structure for the design system
2. A stack recommendation (keep Tailwind with guardrails? switch? hybrid?)
3. Concrete enforcement mechanisms
4. A migration plan for existing plugins

---

## Execution order

1. **Track 1 first** — Baseline LLM visual judgment. No point building a knowledge base agents can't use. Run the pairwise comparison experiment and measure the ceiling.
2. **Track 4 early** — Architecture decisions compound. Every plugin built on the wrong stack is debt. Worth deciding the structural approach before too many more features land. Can run in parallel with Track 1.
3. **Track 2 in parallel** — Reference collection and teardowns. Feeds both Track 3 and Track 4 (real design systems inform our structure).
4. **Track 3 last** — Auditing methodology depends on Tracks 1, 2, and 4 being settled.

## First concrete step

Build a small experiment:
- Collect ~10 pairs of UI screenshots (good vs. bad of same type of component/page)
- Write a script that shows each pair to Claude and asks: "Which is better? Why? List 3 specific differences."
- Score the results against human ground truth
- This gives us a baseline for LLM visual judgment quality
