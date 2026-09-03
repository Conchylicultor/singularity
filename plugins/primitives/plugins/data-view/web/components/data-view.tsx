import { type CSSProperties, type ReactNode, useMemo } from "react";
import { useElementSize } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  DATA_VIEW_HEADER_OFFSET_VAR,
  type CreateOption,
  type DataViewDensity,
  type DataViewId,
  type DataViewProps,
} from "../../core";
import {
  EditableViewSwitcher,
  useViewVariants,
  type ResolvedViewInstance,
} from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { ViewSourceEntry } from "@plugins/primitives/plugins/data-view/plugins/view-core/core";
import { DataViewSlots, type DataViewContribution } from "../slots";
import {
  useDataViewModel,
  type ReadyViewModel,
  type ViewModel,
} from "../internal/use-data-view-model";
import type { DataViewShellChrome } from "../internal/body-types";
import { useDataViewDevGuards } from "../internal/use-dev-guards";
import { CreatorsControl } from "./creators-control";
import { DataViewBody } from "./data-view-body";

/**
 * Host entry point. Every DataView is config-backed (config mode is universal):
 * its `storageKey` is a `defineDataView` id with a centrally-registered
 * `viewsDescriptor`, so the host always builds the config-backed `ViewModel`
 * (config-authored instances, full instance actions, durable per-instance
 * sort/filter written back to the config row) and renders the editable
 * view-switcher.
 *
 * Split as shell + body: the shell (this file) owns the per-surface concerns —
 * the view model, the switcher, the placeholder branch, the dev guards, and the
 * toolbar-height measurement — while `DataViewBody` owns everything downstream
 * of "which instance is active" (the field-extension fold, the data plumbing,
 * the sort/filter controllers, the toolbar, the view render).
 */
export function DataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  const contributions = DataViewSlots.View.useContributions();
  // The single-source path is ONE implicit source entry (`id`/`title`
  // undefined): every config row (all source-less) resolves through it, and the
  // add menu stays the flat single-group fast path.
  const hasHierarchy = !!props.hierarchy;
  const { views, viewOptions } = props;
  const entries = useMemo<ViewSourceEntry<DataViewContribution>[]>(
    () => [{ contributions, hasHierarchy, views, viewOptions }],
    [contributions, hasHierarchy, views, viewOptions],
  );
  const viewModel = useDataViewModel(
    props.storageKey,
    entries,
    props.defaultView,
    props.pinnedView,
  );
  return (
    <DataViewShellFrame
      storageKey={props.storageKey}
      viewModel={viewModel}
      contributions={contributions}
      title={props.title}
      actions={props.actions}
      creators={props.creators}
      density={props.density}
      pinnedView={props.pinnedView}
    >
      {(activeInstance, chrome, readyModel) => (
        <DataViewBody<TRow>
          {...props}
          viewModel={readyModel}
          activeInstance={activeInstance}
          chrome={chrome}
        />
      )}
    </DataViewShellFrame>
  );
}

/**
 * The shared per-surface shell frame: dev guards, the root sticky containing
 * block + `--dv-header-offset` publication, the editable switcher, and the
 * zero-instances placeholder branch. `children` renders the per-active-instance
 * body — it is invoked as a plain function (not a component), so it must stay
 * hook-free; the body's hooks live in `DataViewBody`'s own components.
 *
 * Shared by the single-source `DataView` above and `MergedDataView` (exported
 * plugin-internally, never from the barrel) so the placeholder / measurement /
 * switcher logic cannot drift between the two hosts.
 */
export function DataViewShellFrame(props: {
  storageKey: DataViewId;
  viewModel: ViewModel;
  contributions: SealContributions<DataViewContribution>[];
  title?: ReactNode;
  actions?: ReactNode;
  creators?: CreateOption[];
  density?: DataViewDensity;
  /** Present → this host shows one named instance and paints no switcher. */
  pinnedView?: string;
  /** Renders the per-active-instance body. Receives the SETTLED model — the
   *  shell is the one place that narrowed the union, so a host never re-derives
   *  (or forgets) that narrowing at its own call site. */
  children: (
    activeInstance: ResolvedViewInstance<DataViewContribution>,
    chrome: DataViewShellChrome,
    viewModel: ReadyViewModel,
  ) => ReactNode;
}): ReactNode {
  const {
    storageKey,
    viewModel,
    contributions,
    title,
    actions,
    creators,
    density,
    pinnedView,
    children,
  } = props;

  // DataView is always natural-height and never owns a scroller — the pane owns
  // exactly one scroll (via `<PaneScroll>`). Dev-only structural guard fires if
  // the enclosing pane forgot to provide that scroll (kept in its own hook so the
  // effect's DOM walk stays out of this component's React Compiler analysis).
  const rootRef = useDataViewDevGuards(storageKey);

  // Measure the sticky toolbar's height and publish it on the root as
  // `--dv-header-offset` (see `DATA_VIEW_HEADER_OFFSET_VAR`). Grouped views stack
  // their sticky group headers directly below the toolbar by reading this var, so
  // two stacked sticky bands never overlap regardless of the toolbar's (dynamic)
  // height. Mirrors the `--chrome-mask` cross-plugin CSS-var convention. The ref
  // crosses into the body, which attaches it to the toolbar's `<Sticky>`.
  const [toolbarRef, { height: toolbarHeight }] = useElementSize();

  const viewVariants = useViewVariants(contributions);

  // The surface's own views are not known yet (the config document has not
  // arrived — a cold boot whose snapshot failed, a WS still catching up). We
  // cannot say whether this surface has views, so we say exactly that: a
  // skeleton, not an answer. Rendering the "No views configured" branch here is
  // what used to make a DataView state, confidently and wrongly, that a fully
  // configured surface had nothing in it for the seconds before its config
  // landed. `Loading` fades in only after ~120ms, so the normal (already
  // hydrated) case still paints nothing at all.
  if (!viewModel.ready) {
    return (
      <Stack gap="none" ref={rootRef}>
        <ShellToolbar title={title} actions={actions} creators={creators} />
        <div className="rail-follow py-md">
          <Loading variant="rows" />
        </div>
      </Stack>
    );
  }

  const { instances, activeId } = viewModel;
  const pinned = pinnedView !== undefined;
  const matched = instances.find((r) => r.instance.id === activeId) ?? null;
  // The first-instance fallback is for an UNPINNED surface, whose active id can
  // legitimately be stale (a renamed instance, a device that never chose one).
  // A pinned surface must not have it: `resolveActiveId` returns "" precisely to
  // say "the pinned instance is not authored", and falling through to
  // `instances[0]` would answer that by rendering someone else's tab — the exact
  // silent-wrong-list failure pinning exists to prevent, and invisible on any
  // surface that has instances at all.
  const activeInstance = pinned ? matched : (matched ?? instances[0] ?? null);

  const activeViewId = activeInstance?.instance.id ?? "";

  // Config is the single source of truth: zero authored view-instances → render
  // an honest placeholder rather than an empty shell. Reachable ONLY once the
  // config is known (the branch above), so this claim is always true when it is
  // made. The build-time `config:overrides-authored` check is the real forcing
  // function (the views descriptor sets `requiresAuthoredOverride`, so the build
  // seeds the config and marks it for review); this keeps the pane from crashing
  // if a config is authored-but-empty. Early-returning here (before the body
  // mounts) is the body's only gate.
  if (!activeInstance) {
    return (
      <Stack gap="none" ref={rootRef}>
        <ShellToolbar title={title} actions={actions} creators={creators} />
        <div className="rail-follow py-md">
          <Placeholder>
            {pinned ? (
              <>
                No view instance <code>{pinnedView}</code> in{" "}
                <code>config/&lt;plugin&gt;/{storageKey}.jsonc</code>
              </>
            ) : (
              <>
                No views configured — author{" "}
                <code>config/&lt;plugin&gt;/{storageKey}.jsonc</code>
              </>
            )}
          </Placeholder>
        </div>
      </Stack>
    );
  }

  // The switcher needs only model inputs, so the shell builds the node once per
  // surface and the body renders it inside the toolbar as an opaque node.
  const chrome: DataViewShellChrome = {
    // A pinned host paints NO switcher — the node itself, not just its count.
    // `switcherCount` gates only the COMPACT toolbar (`switcherCount > 1`); the
    // wide toolbar renders `{switcher}` unconditionally, so a count of 1 alone
    // would leave a wide pinned surface showing the full tab strip, whose clicks
    // write a shared selection this host then ignores — a dead switcher, which
    // is worse than the shared-selection problem pinning solves.
    switcher: pinned ? null : (
      <EditableViewSwitcher
        instances={instances}
        activeId={activeViewId}
        onSelect={viewModel.setActiveView}
        actions={viewModel.actions}
        viewVariants={viewVariants}
      />
    ),
    switcherCount: pinned ? 1 : instances.length,
    title,
    actions,
    density,
    stickyRef: toolbarRef,
  };

  return (
    // `Stack gap="none"` = a plain `flex flex-col` block box (no `min-h-0 flex-1`)
    // that establishes this DataView's own sticky containing block and lets the
    // body grow to natural height — the pane (via `<PaneScroll>`) owns the scroll.
    <Stack
      gap="none"
      ref={rootRef}
      // The whole surface is the hover anchor for the compact fold's options
      // Publish the measured sticky-toolbar height so grouped views stack their
      // own sticky group headers directly below it (see DATA_VIEW_HEADER_OFFSET_VAR).
      style={
        {
          [DATA_VIEW_HEADER_OFFSET_VAR]: `${Math.round(toolbarHeight)}px`,
        } as CSSProperties
      }
    >
      {children(activeInstance, chrome, viewModel)}
    </Stack>
  );
}

/**
 * The toolbar the shell paints while it has no active instance to render a body
 * for — shared by the loading and the confirmed-empty branches so the surface's
 * chrome (title, actions, create affordances) does not appear, disappear and
 * reappear as the config settles. The real toolbar (switcher + controls) lives
 * in `DataViewBody`, which only mounts once an instance exists.
 */
function ShellToolbar(props: {
  title?: ReactNode;
  actions?: ReactNode;
  creators?: CreateOption[];
}): ReactNode {
  const { title, actions, creators } = props;
  return (
    <Sticky
      edge="top"
      // eslint-disable-next-line layout/no-adhoc-layout -- horizontal toolbar row of variable-content controls; no named-slot primitive maps
      className="bg-background flex items-center gap-sm py-sm rail-follow"
    >
      {title ? (
        <Text as="div" variant="label">
          {title}
        </Text>
      ) : null}
      {/* eslint-disable-next-line row-actions/no-raw-actions-slot -- surface-level toolbar actions, one per DataView, not a per-row cluster */}
      {actions ? <div className="ml-auto">{actions}</div> : null}
      <div className={actions ? undefined : "ml-auto"}>
        <CreatorsControl creators={creators} />
      </div>
    </Sticky>
  );
}
