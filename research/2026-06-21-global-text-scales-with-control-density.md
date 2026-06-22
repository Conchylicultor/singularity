# Text scales with control density — one density→text-step policy (Phase 4)

## Context

This is the final brick of the arc:
[Phase 1 — chips](./2026-06-20-global-chip-size-derive-from-control-density.md),
[Phase 3 — region primitives own density](./2026-06-21-global-control-density-region-primitives.md).
The thesis: *size stops being a per-element property and becomes a property of the
region* — you declare **where you are** via one ambient `ControlSize`, and every
leaf inside (button, chip, badge, icon, **and text**) infers its size from it, so
neighbours can't desync.

`<Text>` is the one leaf still left out: in a compact region (a `DataTable`, a
debug pane set to `xs`, a tree row) the buttons/chips shrink but the labels stay
at their fixed variant size, so typography reads out of step with the region.

**Two findings from exploration that reshape the task:**

1. **The doc's caveat is based on a wrong premise.** The `tokens/density` preset
   (Comfortable/Cozy/Compact, `ui/plugins/tokens/plugins/density/shared/group.ts`)
   scales **padding, control heights, spacing ramp, chrome heights** — it has
   **zero font-size tokens**. Typography is owned by a *separate* global preset,
   `tokens/type-scale`. So there is **no double-apply risk** between the density
   preset and a `ControlSize → Text` signal. They are orthogonal axes that
   compose: `ControlSize` picks a *different role*; the type-scale preset still
   themes every role. The reconciliation is simply to document the three axes.

2. **The real defect is an inconsistency, not a missing feature.** Today each
   control hard-codes its **own** density→size threshold:
   - `Button` (shadcn `cva`): text steps at the **`md→sm`** boundary
     (`md/lg → text-sm 0.875`, `sm/xs → text-xs 0.75`).
   - `Badge` (`badge.tsx:65`): text steps at the **`sm→xs`** boundary
     (`xs → text-3xs`, else `text-caption`).

   Same `useControlSize()` input, two different ladders. They collide at `0.75rem`
   in an `sm` region (coincidence) and **diverge at `xs`** (button label visibly
   larger than badge label). Bolting `Text` onto this would add a *third* ad-hoc
   ladder. Per the repo's "fix the structural issue, not the instance" rule, the
   fix is to introduce **one** density→text-step policy and have **Button, Badge,
   and Text all consume it**.

## The three axes (document this; they're orthogonal)

| Axis | Owner | Scope | Controls |
|---|---|---|---|
| **Density preset** | `tokens/density` | global | padding / spacing / control heights |
| **Type-scale preset** | `tokens/type-scale` | global | the font-size/weight of every role |
| **ControlSize** | `ControlSizeProvider`/region | per-region | affordance density → height/icon/chip/**text step** |

`useControlSize()` is **not** removed — it is the region *signal* (Bar=`sm`,
DataTable=`xs`, …). What centralises is the *policy*: how a density maps to a text
step.

## Decision: the single step sits at `sm → xs`

Modern principle: **type size tracks content density, not chrome affordance.**
`sm`/`md`/`lg` are comfortable affordance tiers (they change control
height/padding, not type size); only the explicitly-compact **`xs`** tier drops a
type rung. Rationale: keep a legibility floor (chrome/body stay readable by
default), keep hierarchy stable (toolbars/headers are fixed anchors — and `Bar`
defaults to `sm`, so stepping at `sm` would shrink every header/toolbar label),
and treat compaction as a *content* concern (tables/trees/logs cram more rows;
toolbars have no more-rows problem). This matches `Badge`'s existing instinct.

**Accepted consequence:** `Button` currently also steps at `sm` (the legacy
shadcn threshold — the outlier that created the inconsistency). Under the unified
policy it steps **only at `xs`**, so a toolbar button label grows from `text-xs`
(0.75) back to the comfortable `text-sm` (0.875) at `sm`. This is a visible change
to every toolbar and is the intended correction.

## Mechanism

### 1. One policy in `control-size.tsx` (ui-kit — the lowest layer, so `Button` can import it)

`plugins/primitives/plugins/css/plugins/ui-kit/web/theme/control-size.tsx`

```ts
/** THE single density→text-step policy. xs drops one type rung; sm/md/lg don't. */
export function textStepFor(density: ControlSize): 0 | 1 {
  return density === "xs" ? 1 : 0;
}

/** Button's own text rungs (body size + the cva's font-medium), driven by the step. */
export function buttonTextClassFor(density: ControlSize): string {
  return textStepFor(density) ? "text-xs" : "text-sm";
}
```

Returning the raw `text-sm`/`text-xs` from a non-class-context `return` is
lint-safe: `no-adhoc-typography` only walks `className`/`cn|clsx|twMerge`
arguments and never follows a call result into its function body (verified in
`…/text/lint/no-adhoc-typography.ts`). `ui-kit` is the only sanctioned home for
raw size mechanics anyway.

### 2. Weight-preserving compact utilities in `app.css`

`plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css` (after the
existing `text-<role>` block, ~line 336)

A naïve "step to the next smaller *role*" drifts weight (subheading 600→body 400,
label 500→caption 400) — a compact subheading would lose its semibold and stop
reading as a subheading. Instead add one `-compact` utility per role: **next
size+line-height rung down, original weight/tracking preserved.** Each carries the
required `/* twmerge: extend font-size */` marker.

```css
@utility text-title-compact      { font-size: var(--font-size-heading);    line-height: var(--line-height-heading);    font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; }  /* twmerge: extend font-size */
@utility text-heading-compact    { font-size: var(--font-size-subheading); line-height: var(--line-height-subheading); font-weight: var(--font-weight-semibold); letter-spacing: -0.005em; } /* twmerge: extend font-size */
@utility text-subheading-compact { font-size: var(--font-size-body);       line-height: var(--line-height-body);       font-weight: var(--font-weight-semibold); }                          /* twmerge: extend font-size */
@utility text-body-compact       { font-size: var(--font-size-label);      line-height: var(--line-height-label);      font-weight: var(--font-weight-normal); }                            /* twmerge: extend font-size */
@utility text-label-compact      { font-size: var(--font-size-caption);    line-height: var(--line-height-caption);    font-weight: var(--font-weight-medium); }                            /* twmerge: extend font-size */
@utility text-caption-compact    { font-size: var(--font-size-2xs);        line-height: var(--line-height-2xs);        font-weight: var(--font-weight-normal); }                            /* twmerge: extend font-size */
```

`./singularity build` regenerates `custom-utilities.generated.ts` from these
markers; the `app-css-utilities-in-sync` check guards it. (`eyebrow` needs no new
utility — it composes `text-caption-compact` with its existing small-caps classes
in `text.tsx`.)

### 3. `Text` consumes the step

`plugins/primitives/plugins/css/plugins/text/web/internal/text.tsx`

- Import `useControlSize`, `textStepFor` from the ui-kit barrel.
- Add a `COMPACT_VARIANT_CLASS: Record<TextVariant, string>` mirroring
  `VARIANT_CLASS` but with the `-compact` utilities (and the eyebrow composite
  using `text-caption-compact`).
- In the component: pick the map by the ambient step.

```ts
const density = useControlSize();
const compact = textStepFor(density) === 1;
const variantClass = variant
  ? (compact ? COMPACT_VARIANT_CLASS : VARIANT_CLASS)[variant]
  : undefined;        // variant omitted = inherit; nothing to compact
const typography = cn(variantClass, TONE_CLASS[tone]);
```

No new prop, no escape hatch — the region owns it (matches the arc's invariant).

### 4. `Badge` consumes the step

`plugins/primitives/plugins/css/plugins/badge/web/internal/badge.tsx:65`

```ts
const textClass = textStepFor(density) ? "text-caption-compact" : "text-caption";
```

Replaces the bespoke `density === "xs" ? "text-3xs" : "text-caption"`. Badge's
threshold was already `xs`, so the only delta is `xs` badges render `text-2xs`
(0.6875, via `caption-compact`) instead of `text-3xs` (0.625) — now on the shared
ramp. Negligible visual change; gains the single source of truth.

### 5. `Button` consumes the step

`plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/button.tsx`

- Remove `text-sm` from the cva **root** string and `text-xs` from the **`sm`**
  and **`xs`** size tokens (cva keeps owning height/padding/icon-size).
- Apply text via the shared helper, except for the `inline` aspect (which keeps
  its `text-[1em]`):

```ts
const textClass = aspect === "inline" ? undefined : buttonTextClassFor(density)
// …
className={cn(buttonVariants({ variant, size: resolvedSize, shape }), textClass, className)}
```

Result: `md/lg/sm → text-sm`, `xs → text-xs`, threshold owned by `textStepFor`.

## Docs

- `…/css/plugins/text/CLAUDE.md` — new "Compact density" section: `Text` reads
  ambient `ControlSize`; at `xs` it swaps each variant for its weight-preserving
  `-compact` form; the three orthogonal axes table.
- `…/css/plugins/badge/CLAUDE.md` — note text now flows through `textStepFor`.
- `…/css/plugins/ui-kit/CLAUDE.md` (ControlSize section) + `…/css/plugins/control-size/CLAUDE.md`
  — document `textStepFor`/`buttonTextClassFor` as the single density→text policy
  and the `sm→xs` step decision.
- `…/css/plugins/ui-kit/web/theme/CLAUDE.md` — the marker grammar already covers
  the new `@utility` lines; no change beyond them existing.
- `.claude/skills/theme/SKILL.md` (control-size section) — state the rule: type
  size steps only at `xs`; chrome (`sm`) stays at the comfortable size.
- Autogen reference blocks regenerate via `./singularity build`.

## Enforcement

No new lint rule. The policy is plain shared code; the threshold lives in one
function so a future change is a single edit. `type-check` + `no-adhoc-typography`
+ `app-css-utilities-in-sync` (twmerge) cover the surface.

## Tests

- `…/css/plugins/text/web/__tests__/compact-density.test.tsx` — render `<Text
  variant="heading">` inside `<ControlSizeProvider size="xs">` and assert the
  `text-heading-compact` class; assert `text-heading` under `sm`/`md`. Mirrors the
  existing `single-line.test.tsx` context test.
- `…/css/plugins/ui-kit/web/theme/control-size.test.ts` (bun:test) — `textStepFor`
  returns 1 only for `xs`; `buttonTextClassFor` maps the four tiers correctly.

## Verification

1. `./singularity build` — regenerates `custom-utilities.generated.ts` + autogen
   docs; runs `type-check`.
2. `./singularity check type-check` and `./singularity check eslint` — clean
   (no-adhoc-typography must not flag the new utilities or helpers).
3. Screenshots (`bun e2e/screenshot.mjs --url … --out /tmp/text-density`):
   - **Any app toolbar** (`http://<wt>.localhost:9000/agents`) — button labels
     grow from 12→14px at `sm`; header titles unchanged.
   - **Studio → Contributions table** (`DataTable`, `xs`) — cell text + badges
     read one rung smaller, hierarchy preserved.
   - **Pages sidebar / task tree** (`tree/row-chrome`, `xs`) — row labels compact.
   - **Debug → Reports / Queue** (`xs`) — labels + badges compact and aligned.
   - **A compact `Card`** (`controlSize="xs"`) with a `variant="title"` — title
     still visibly larger than its body, both stepped down (hierarchy intact).
4. Confirm a default (`md`) surface (Home launcher, Pages welcome) is unchanged.

## Blast radius

`xs` regions today: `DataTable` (default), `tree/row-chrome`, `pages-sidebar`,
`debug/reports`, `debug/queue`, jsonl tool-call cards, browser chrome,
`row-actions`. All of their `<Text>` compacts automatically — the intended
"compact region reads compact end-to-end." Plus every toolbar's button labels
grow to 14px (the `sm` correction). No `md` surface changes.

## Critical files

- `plugins/primitives/plugins/css/plugins/ui-kit/web/theme/control-size.tsx` (policy)
- `plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css` (`-compact` utilities)
- `plugins/primitives/plugins/css/plugins/text/web/internal/text.tsx`
- `plugins/primitives/plugins/css/plugins/badge/web/internal/badge.tsx`
- `plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/button.tsx`
- Docs: `text/CLAUDE.md`, `badge/CLAUDE.md`, `ui-kit/CLAUDE.md`,
  `control-size/CLAUDE.md`, `.claude/skills/theme/SKILL.md`
- Tests: `text/web/__tests__/compact-density.test.tsx`,
  `ui-kit/web/theme/control-size.test.ts`
