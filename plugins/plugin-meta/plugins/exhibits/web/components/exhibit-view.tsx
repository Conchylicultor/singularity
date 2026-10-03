import { Suspense, use, type ComponentType, type ReactElement } from "react";
import type {
  AppExhibit,
  Exhibit,
} from "@plugins/plugin-meta/plugins/exhibits/core";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// One module load per app exhibit, for the page's lifetime: `use()` needs the
// SAME promise on every render, and the exhibit object is the catalog's own
// (the catalog loads once per page), so it keys the cache.
const appModules = new WeakMap<
  AppExhibit,
  Promise<{ default: ComponentType }>
>();

function appModuleOf(exhibit: AppExhibit): Promise<{ default: ComponentType }> {
  let pending = appModules.get(exhibit);
  if (pending === undefined) {
    pending = exhibit.load();
    appModules.set(exhibit, pending);
  }
  return pending;
}

/** Renders a component handed in as data — a prop, never one made in render. */
function Rendered({
  component: Component,
}: {
  component: ComponentType;
}): ReactElement {
  return <Component />;
}

/** Suspends until the exhibit's module loads; a failed load throws to the boundary. */
function AppExhibitModule({ exhibit }: { exhibit: AppExhibit }): ReactElement {
  const loaded = use(appModuleOf(exhibit));
  return <Rendered component={loaded.default} />;
}

function AppExhibitBody({ exhibit }: { exhibit: AppExhibit }): ReactElement {
  return (
    <Suspense fallback={<Loading variant="spinner" />}>
      <AppExhibitModule exhibit={exhibit} />
    </Suspense>
  );
}

/**
 * Neutral children for a region exhibit viewed on its own: plain text rows that
 * know nothing about the region. The layout harness passes its own kit instead.
 */
function RegionSample(): ReactElement {
  return (
    <Stack gap="xs">
      <Text variant="body">First row of region content</Text>
      <Text variant="body" tone="muted">
        A second, muted row
      </Text>
      <Text variant="caption" tone="muted">
        Caption-sized trailing row
      </Text>
    </Stack>
  );
}

function ExhibitBody({ exhibit }: { exhibit: Exhibit }): ReactElement {
  switch (exhibit.runtime) {
    case "isolated":
      return exhibit.render();
    case "isolated-region":
      return exhibit.render(<RegionSample />);
    case "app":
      return <AppExhibitBody exhibit={exhibit} />;
  }
}

/**
 * Render any exhibit — isolated, region or app — inside its own error
 * boundary, so one crashing exhibit costs its own cell, never the surface
 * showing it. With `width`, the exhibit is laid out in a box of exactly that
 * many px (an exhibit's `widths` are where it changes shape).
 */
export function ExhibitView({
  exhibit,
  width,
}: {
  exhibit: Exhibit;
  width?: number;
}): ReactElement {
  const label =
    width === undefined ? exhibit.id : `${exhibit.id} @ ${String(width)}px`;
  const body = (
    <PluginErrorBoundary slot="exhibit" label={label}>
      <ExhibitBody exhibit={exhibit} />
    </PluginErrorBoundary>
  );
  if (width === undefined) return body;
  // Fixed-px width is the point: the exhibit is shown at one of its widths.
  return <div style={{ width }}>{body}</div>;
}
