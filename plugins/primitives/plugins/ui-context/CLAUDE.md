# ui-context

The **UI-context lineage**: given a DOM element, "what composed this?" — the
outer→inner chain of plugin contributions and named screen regions that produced
it. This plugin owns the node model, the DOM attribute grammar, the
portal-crossing chain helpers, the `<UiRegion>` producer, and the
`collectLineage` walk.

## Why it is its own neutral leaf

Two unrelated consumers need the same answer: `improve/element-picker` (the
`<ui-context …>` tag a user hands an agent) and `reports/render-loop` (which
culprit component caused a render loop). Neither may depend on the other — a
reports plugin reaching into the Improve *app's* subtree is a layering
inversion — so the shared vocabulary lives below both, in a leaf whose only
cross-plugin dependency is `primitives/css/ui-kit` (for the portal-forward
bridge). No cycle is possible. Same carve-out reasoning as
`primitives/surface-id`.

The name is the concept the repo already has (`<ui-context>`, `UiContextMeta`),
and it holds the walk **next to the model the walk produces**.

## The two producers

A lineage node is stamped onto the DOM by exactly one of two mechanisms, and the
split is deliberate:

- **Contributions — opt-in, via the picker's slot-item middleware.** It wraps
  *every* slot contribution repo-wide in a `display:contents` marker span. That
  cost should only be paid when the element-picker is actually in the app
  composition, so the middleware stays in `improve/element-picker` and registers
  itself there. This plugin supplies only the grammar it stamps
  (`contributionNodeAttrs`, `appendLineage`).
- **Regions — always on, via `<UiRegion>`.** A handful of explicit call sites
  (miller columns, full-pane, tabs, floating windows), so there is no composition
  cost to gate. `<UiRegion>` therefore lives here and is unconditional.

`<UiRegion>` is a **component**, not a hook returning props: a hook cannot supply
the portal-forward context (that needs a provider), and a hook + spread pair
means forgetting the spread silently breaks the walk. One component makes the
broken state unrepresentable.

## Regions must supply their own position

A region node carries a free-form `label` — "column 3 of 3" — supplied by the
producer. This is not laziness: **miller panes are siblings**, so an upward DOM
walk from column 3 crosses only column 3's own marker and has no way to see the
other two. Position among siblings is knowable only where the set is rendered.
The value is model-facing prose, not machine input; only the producer knows what
"where" means for its own kind of region.

Likewise `pluginId` on a region is the plugin owning the region's *content*, not
the one rendering the frame — a pane's frame is drawn by the layout renderer,
but the pane belongs to whoever registered it.

## Attribute grammar

`data-lineage` is both the discriminator and the single walk selector, so the
walk stays one `closest()` per level:

```
data-lineage="contribution"   data-plugin-id data-slot-id data-contribution-id
data-lineage="region"         data-region-kind data-region-id data-region-label data-plugin-id
```

Flat attributes rather than a JSON payload: the inspector shows
`data-region-id="deploy-deployment-detail"` at a glance, pre-existing
`data-plugin-id` / `data-slot-id` assertions survive byte-identical, and there is
no `JSON.parse` per ancestor level on the click path.

The skip rule (`data-plugin-id=""` ⇒ drop the node) applies to **contributions
only**. A region with no owning plugin is still collected — its identity is the
whole point, and the plugin is the optional part.

Formatting is `formatLineageNode` / `formatLineagePath` in `core/`: `@` means
"contributes into", `#` means "occupies". `parseLineageNode` /
`parseLineagePath` are their **inverses**, beside them so a consumer wanting the
chain as structure (the chip popover gives each node its own line) can't spell
the grammar differently from the writer. The parse is **total** — a bare
`pluginId` is a legal segment, so an unrecognized one *is* that plugin id and
round-trips back to itself; no failure arm to absorb. `node.test.ts` pins it.

```
apps.deploy.shell@apps.app > apps/deploy/deployments#pane:deploy-deployment-detail[column 3 of 3] > tasks/task-header@PaneToolbar.Item
```

## Reading the grammar: the shared marker walks

`web/internal/marker-walk.ts`, exported from `web/` — `isMarkerSpan`,
`nearestSource` (`data-source="file:line"`), `nearestOwner`
(`data-ui-owner="Name@file:line"`). Used by `collectMeta` here and by
`reports/render-loop`'s culprit attribution; don't re-derive a local copy.

`isMarkerSpan` keys on **`data-lineage`**, not `data-slot-id`. Every marker span
is JSX in its producer's own file, so it carries a `data-source` of its own —
a walk that fails to recognize one reports the *producer's* file for everything
beneath it. `data-slot-id` misses `<UiRegion>`, which would make everything
inside a miller column resolve to `ui-region.tsx`.

## Crossing portals

Popovers, dialogs, menus and the viewport overlay relocate their content to
`document.body`, severing it from the marker spans (which stay in the source
tree) — a naive DOM-ancestry walk loses the whole lineage for portaled UI. So
each producer *also* appends its node to the **portal-forward bridge**
(`PortalForwardProvider` / `usePortalForwardedAttrs` in `primitives/css/ui-kit`),
a React-context bag of `data-*` attributes that crosses portals; every portal
surface re-stamps the bag onto its positioner. The serialized chain rides as
`LINEAGE_ATTR` (`data-plugin-lineage`), and `collectLineage` splices it in ahead
of anything collected inside the portal.

The serialized value **must be memoized** at each producer (both `<UiRegion>`
`useMemo`s exist for this): an unstable string identity invalidates the
`PortalForwardProvider` value for every portal surface below, on every region
re-render.

## Fail loudly

`parseLineage` is deliberately **not** wrapped in a try/catch, and
`readLineageNode` throws on an unrecognized `data-lineage` value. Both values are
written only by this plugin's producers, so a failure there is real corruption to
surface, not an absence to absorb.

## The `<ui-context>` token

`core/internal/token.ts` — the wire format handed to an agent.
`serializeUiContext(meta, provenance)` / `parseUiContext` round-trip it. A
**paired** element, standard XML split — machine coordinates in attributes,
model-facing prose in the body as two sibling tags:

```
<ui-context url="…" plugin="…" slot="…" contribution="…" path="…" selector="…" source="…" owner="…"><hint>…</hint><picked-content><element label></picked-content></ui-context>
```

`UI_CONTEXT_FIELDS` is the **single source of truth** for the attribute set:
serialize writes it, parse reads it, and the chip popover renders it, each by
iterating the list — so the three cannot drift (a compile-time exhaustiveness
check forces every `UiContextMeta` key to be registered). Adding a field there
makes it flow everywhere by construction; a field the parser doesn't know is
simply ignored, which is why dropping `pane=` needed no legacy branch.

`plugin`/`slot`/`contribution` describe **one** node — the innermost of whatever
kind — never a plugin from one node paired with a slot from another. `path` is
the full chain and the **sole** carrier of region info, so it is emitted
unconditionally.

The tag flows verbatim into the agent prompt, hence the constant `<hint>`
explaining what it is and how it was produced, kept apart from the label body so
the model never disentangles framing from data. Values are sanitized
quote/angle-bracket/newline-free so the tag stays single-line and survives the
editor's line-based markdown sync.

### Provenance

`serializeUiContext(meta, provenance)`'s second argument (`"picked" | "crash"`)
picks the `<hint>` and body tag (`<picked-content>` / `<crash-site>`) out of the
`PROVENANCE` record — the token's only producer-specific part. **Required, not
defaulted**: a default lets a new producer ship a hint that lies. Registering one
is a single edit — `parseUiContext` builds its body-tag alternation from
`PROVENANCE`, and `UI_CONTEXT_RE`'s body is already `[\s\S]*?`.

Provenance is deliberately **not** a `UI_CONTEXT_FIELDS` attribute: it says why
we emit, not where the element is, and a non-`string` union in `UiContextMeta`
would break both the `Exclude<keyof …, "element">` exhaustiveness check and
`parseUiContext`'s `meta[f.key] = v` assignment.

### Meta builders and the wire schema

`collectMeta(el)` — the full pick: lineage **plus** `selector`/`source`/`owner`
read off `el` itself. `collectLineageMeta(el, element)` — ancestors only, for
callers whose `el` is not the subject (a crash boundary's fallback, whose own
`<Line>` carries a `data-source` pointing at `crash-fallback.tsx`); the label is
passed in.

`UiContextMetaSchema` is the zod twin, for producers crossing a trust boundary.
Bound to the interface by a `keyof` set comparison **and** mutual assignability —
assignability alone silently accepts an omitted *optional* field, since
`{…no owner}` and `UiContextMeta` are assignable both ways.

## Not this plugin's business

`data-pane-id` — a separate, load-bearing DOM convention with five independent
readers (render-loop attribution, overscroll-hint, three e2e scripts). The region
marker is *additive* alongside it; nothing here reads or writes it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The UI-context lineage: the node model (contribution | region), its DOM attribute grammar, the portal-crossing chain helpers, the <UiRegion> producer, the collectLineage walk, and the <ui-context> token (collectMeta / serialize / parse). A neutral leaf so both improve/element-picker and reports/render-loop can ask 'what composed this element?' without either depending on the other.
- Web:
  - Uses:
    - `primitives/css/ui-kit.PortalForwardProvider`
    - `primitives/css/ui-kit.usePortalForwardedAttrs`
  - Exports (types):
    - `ContributionNodeAttrs`
    - `RegionNodeAttrs`
  - Exports (values):
    - `appendLineage`
    - `collectLineage`
    - `collectLineageMeta`
    - `collectMeta`
    - `contributionNodeAttrs`
    - `isMarkerSpan`
    - `LINEAGE_ATTR`
    - `nearestOwner`
    - `nearestSource`
    - `NODE_ATTR`
    - `parseLineage`
    - `readLineageNode`
    - `regionNodeAttrs`
    - `UiRegion`
- Cross-plugin:
  - Imported by:
    - `improve/element-picker`
    - `layouts/full-pane`
    - `layouts/miller`
    - `primitives/adaptive-bar`
    - `primitives/error-boundary`
    - `reports/crash`
    - `reports/render-loop`
- Core:
  - Exports (types):
    - `ContributionNode`
    - `LineageNode`
    - `RegionNode`
    - `UiContextField`
    - `UiContextMeta`
    - `UiContextProvenance`
  - Exports (values):
    - `formatLineageNode`
    - `formatLineagePath`
    - `parseLineageNode`
    - `parseLineagePath`
    - `parseUiContext`
    - `serializeUiContext`
    - `UI_CONTEXT_FIELDS`
    - `UI_CONTEXT_RE`
    - `UiContextMetaSchema`

<!-- AUTOGENERATED:END -->
