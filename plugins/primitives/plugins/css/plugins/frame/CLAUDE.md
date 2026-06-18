# frame

The named-slot row primitive. A horizontal row of up to four **role slots** —
`leading` / `content` / `meta` / `trailing` — passed as props (no `children`).
The shrink hierarchy lives in one place: CSS Grid, the mode where "a container
crushed by its own chip" is unrepresentable.

## Why a grid, not flex

Rows with a rigid leading cluster + flexible content + secondary metadata used
to re-derive flex space-sharing per call site — each sprinkling `min-w-0` /
`shrink-0` / `flex-1` and hoping the negotiation converges. That produced a
recurring overlap/clip bug class (the canonical victim was the `CollapsibleCard`
header's badge-over-path overlap). `Frame` bakes the negotiation into a grid
track function so callers write **roles, never mechanics**.

## The track function

`frameGridTemplate(present)` is the single source of truth — exported so the
component and the geometry test share one definition. Only present slots produce
a track (an absent slot ⇒ no child ⇒ no track ⇒ no phantom gap):

| Slot       | Track                   | Behaviour                                    |
| ---------- | ----------------------- | -------------------------------------------- |
| `leading`  | `auto`                  | rigid cluster, never shrinks                 |
| `content`  | `minmax(0,max-content)` | primary; holds width, **truncates LAST**     |
| `meta`     | `minmax(0,1fr)`         | secondary; yields space, **truncates FIRST** |
| `trailing` | `auto`                  | rigid-right cluster, never shrinks           |

The contract is **strict priority**, not proportional sharing: `meta` must give
up every pixel of its space before `content` truncates a single character.

## The flexible `fill` track (no-meta rows must not center)

The row needs **exactly one** flexible (`1fr`) track to swallow the container's
leftover width. Without one, the leftover pools into the rigid `auto` clusters —
`justify-content`'s default `stretch` grows auto-max tracks equally — so a
`leading | content | trailing` row (no `meta`) splits the slack between `leading`
and `trailing` and **centers `content`** (and unpins `trailing` from the right).
This was the regression when `CollapsibleCard` moved onto `Frame`: every card
without a file path (task-reminder, system, thinking, …) had its title centered.

`meta` is normally that flexible track. When `meta` is absent but `trailing` is
present, an **inert spacer** takes meta's slot (`fill = meta || trailing`; the
component renders an empty `<div>` there). The grid also sets
`justify-content: start`, which left-packs the no-flex shapes (e.g.
`leading | content` with no trailing) so a lone `auto` never stretches `content`
off-edge. Net: `content` is always left-packed one gap after `leading`, and
`trailing` is always pinned right — asserted by geometry-test checks 4 & 5.

- A weighted-`fr` split (`content:3fr meta:1fr`) only expresses *proportional*
  sharing — both tracks shrink together, so a long `content` ellipsizes while
  `meta` still has room, and `meta`'s small `fr` track is starved below its
  content width even in a roomy row (so `meta` truncates when it shouldn't).
- A rigid `meta` (`auto` / `max-content`) inverts the priority: `content` (the
  lone flexible track) is forced to absorb the whole deficit and truncates first.

`content:minmax(0,max-content)` + `meta:minmax(0,1fr)` is the strict construct:
when roomy, `content` sits at its natural width and `meta`'s `1fr` claims the
leftover (neither truncates); as the row narrows grid shrinks the flexible `1fr`
first, so `meta` ellipsizes while `content` stays whole; only once `meta` is
crushed to 0 does `content` shrink below max-content. The `minmax(0,…)` min on
both lets each reach 0 / fully ellipsize, so nothing clips. The geometry test
certified this by measuring **truncation onset** (`scrollWidth > clientWidth`),
not track allocation. See the doc comment on `frameGridTemplate`.

## Slot wrapping

- **leading / trailing** → an inner `flex items-center` rigid cluster (trailing
  right-justified) carrying the chosen `gap`. The `auto` track can't be crushed
  below the cluster's content.
- **content / meta** → a flexible `min-w-0` track. A **string** is wrapped in
  `<TruncatingText>` automatically; a **node** gets the bare `min-w-0` wrapper so
  a chips+text label keeps its chips whole and only its text leaf ellipsizes.

## Tests

- `web/internal/frame-grid-template.test.ts` (`bun:test`, pure) — asserts the
  exact template string per present-slot combination.
- `web/internal/frame-geometry.test.ts` (Playwright/Chromium) — the real oracle.
  The matrix (`{short,long} content × {with,without} meta × {narrow,wide}`)
  asserts no-overlap / no-clip / rigid-integrity. The **strict-priority** test
  measures TRUNCATION ONSET — `scrollWidth > clientWidth` per slot across a
  width sweep — and asserts `meta` enters the truncating state at a wider
  container width than `content` (meta truncates first), with neither truncating
  when roomy. Measuring track *widths* would be tautological (a flex-slot always
  fills its track), so onset is the only honest signal. Two **falsification**
  cases feed the rejected templates (weighted `3fr/1fr`, naive `1fr/auto`) as
  overrides and assert strict priority does NOT hold — proof the oracle has
  teeth. jsdom can't compute grid layout, so this drives a headless browser. Run
  on demand: `bun test <path>` (not in any automatic gate).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Named-slot row layout primitive: <Frame leading content meta trailing> lays four role slots on a CSS grid with the shrink hierarchy baked in — rigid clusters never crush, content truncates last, meta truncates first. Callers write roles, never min-w-0/shrink-0/flex-1 mechanics.
- Web:
  - Uses: `primitives/css/truncating-text.TruncatingText`, `primitives/css/ui-kit.cn`
  - Exports: Types: `FrameAlign`, `FrameProps`; Values: `Frame`
- Cross-plugin:
  - Imported by: `apps/browser/shell`, `conversations/conversation-view/jsonl-viewer/collapsible-card`, `conversations/conversation-view/jsonl-viewer/tool-call`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/jsonl-viewer/tool-call/bash`, `conversations/conversation-view/jsonl-viewer/tool-call/edit`, `conversations/conversation-view/jsonl-viewer/tool-call/flag-raise`, `conversations/conversation-view/jsonl-viewer/tool-call/read`, `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`

<!-- AUTOGENERATED:END -->
