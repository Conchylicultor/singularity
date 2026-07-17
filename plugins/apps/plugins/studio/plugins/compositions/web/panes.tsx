import { useEffect, useRef, type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  useCompositionData,
  useManifestItems,
  setActiveComposition,
  setCompareComposition,
} from "@plugins/plugin-meta/plugins/composition/web";
import { CompositionsList } from "./components/compositions-list";
import { CompareView, DEFAULT_A, DEFAULT_B } from "./components/compare-view";
import { useSeedActiveComposition } from "./internal/use-seed-active-composition";
import { CompositionDetail } from "./slots";

// Panes are declared first so their types are known before the component bodies
// reference them. Component identifiers below are function declarations
// (hoisted), so the forward reference is safe at runtime.

export const compositionsPane = Pane.define({
  id: "compositions",
  segment: "compositions",
  component: CompositionsBody,
  width: 380,
});

function useResolveComposition({ id }: { id: string }) {
  const items = useManifestItems();
  const { isLoading } = useCompositionData();
  if (isLoading && items.length === 0) return { pending: true, found: false };
  return { pending: false, found: items.some((it) => it.id === id) };
}

/** The composition's name from the manifests config, or undefined while it loads. */
function useCompositionTitle({ id }: { id: string }): string | undefined {
  return useManifestItems().find((it) => it.id === id)?.name;
}

export const compositionDetailPane = Pane.define({
  id: "composition-detail",
  defaultAncestors: [compositionsPane],
  // Segments are GLOBALLY unique across all panes: `c/:id` is conversations'
  // (param names are erased when matching), so the composition detail uses
  // `comp/…`.
  segment: "comp/:id",
  component: CompositionDetailBody,
  // Wider than release-detail's 480: it hosts the closure plugin tree.
  width: 560,
  resolve: useResolveComposition,
  useTitle: useCompositionTitle,
});

export const comparePane = Pane.define({
  id: "composition-compare",
  defaultAncestors: [compositionsPane],
  segment: "compare",
  component: CompareBody,
  width: 480,
});

function CompositionsBody(): ReactElement {
  return (
    <PaneChrome pane={compositionsPane} title="Compositions">
      <CompositionsList />
    </PaneChrome>
  );
}

function CompositionDetailBody(): ReactElement {
  const { id } = compositionDetailPane.useParams();
  useSeedActiveComposition(id);

  return (
    <PaneChrome pane={compositionDetailPane}>
      <CompositionDetail.Host id={id} />
    </PaneChrome>
  );
}

function CompareBody(): ReactElement {
  const { manifests } = useCompositionData();
  // Same store-outlives-pane rule as the detail pane's seed: the ref is the
  // guard, so a `manifests` config write never re-seeds over the user's pick,
  // and there is no cleanup — the next `comp/:id` seed clears the compare slot.
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || manifests.length === 0) return;
    seeded.current = true;
    const a = manifests.find((m) => m.name === DEFAULT_A) ?? manifests[0];
    const b = manifests.find((m) => m.name === DEFAULT_B) ?? manifests[1];
    if (a) setActiveComposition(structuredClone(a));
    if (b) setCompareComposition(structuredClone(b));
  }, [manifests]);

  return (
    <PaneChrome pane={comparePane} title="Compare">
      <CompareView />
    </PaneChrome>
  );
}
