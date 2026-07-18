import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { useState, type ComponentType, type ReactNode } from "react";
import { MdClose, MdOpenInFull } from "react-icons/md";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { paneObjectFor, type PaneInternal, type ResolveHook } from "../pane";

interface Props {
  pane: PaneInternal;
  params: Record<string, string>;
}

export function PaneResolveGuard({ pane, params }: Props) {
  if (!pane.resolve) {
    const Component = pane.component;
    return <Component />;
  }
  // Key the sticky guard on the resolved identity (pane + params). A `swap`
  // re-roots a pane in place — new params, SAME mounted guard — so without the
  // key the sticky-found memory would leak from one resource to the next. The
  // key gives React a fresh guard instance (fresh `sawFound`) per identity,
  // making that leak structurally impossible; a transient `pending` flip keeps
  // the identity stable, so the instance — and its stickiness — survives.
  return (
    <StickyResolveGuard
      key={resolveIdentity(pane.id, params)}
      pane={pane}
      resolve={pane.resolve}
      component={pane.component}
      params={params}
    />
  );
}

/** Stable per-(pane, params) key so identity changes remount the guard. */
function resolveIdentity(paneId: string, params: Record<string, string>): string {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return `${paneId}\u0000${parts.join("\u0000")}`;
}

/**
 * Sticky-found resolve gate. Once the resource has resolved (`found`) for this
 * identity, the real pane stays mounted through any later transient `pending`
 * flip — e.g. an HTTP-fallback refetch failing under host memory pressure flips
 * a long-settled resource back to `pending`. Swapping in the loading fallback
 * there would unmount the pane and destroy the user's scroll, focus, and
 * unsaved editor draft (the debounce timer is cleared on unmount without
 * flushing), then remount cold on recovery.
 *
 * The gate only downgrades on a SETTLED miss (`!pending && !found`): a resource
 * genuinely deleted while its pane is open still surfaces Not Found — stickiness
 * masks transient errors, never real deletion.
 */
function StickyResolveGuard({
  pane,
  resolve,
  component: Component,
  params,
}: {
  pane: PaneInternal;
  resolve: ResolveHook<Record<string, string>>;
  component: ComponentType;
  params: Record<string, string>;
}) {
  const { pending, found } = resolve(params);

  // `sawFound` latches true the first time this identity resolves. Adjusting
  // state during render (guarded by `!sawFound`) is React's sanctioned pattern
  // for deriving state from props without an effect — no flash, no extra frame.
  const [sawFound, setSawFound] = useState(false);
  if (found && !sawFound) setSawFound(true);

  if (found || (sawFound && pending)) return <Component />;

  if (pending) {
    return (
      <FallbackChrome pane={pane} title="Loading…">
        <Loading />
      </FallbackChrome>
    );
  }

  return (
    <FallbackChrome pane={pane} title="Not Found">
      <Placeholder tone="error">
        This resource couldn't be found.
      </Placeholder>
    </FallbackChrome>
  );
}

/**
 * Minimal chrome header for resolve-guard fallback states (Loading / Not
 * Found). The resolved resource is absent, so the real pane component — and
 * its `Actions` contributions — never render. We still want the standard
 * navigation controls (promote and especially × close) so the pane can be
 * dismissed. Mirrors `PaneChrome`'s control logic and gating but omits the
 * actions slot, which has no resource to act on.
 */
function FallbackChrome({
  pane,
  title,
  children,
}: {
  pane: PaneInternal;
  title: string;
  children: ReactNode;
}) {
  const paneObject = paneObjectFor(pane);
  const chrome = pane.chrome;
  const doClose = paneObject.useClose();
  const doPromote = paneObject.usePromote();
  return (
    <Column
      className="h-full"
      header={
        <Bar tier="pane">
          <Text as="span" variant="label" tone="muted" className="truncate">
            {title}
          </Text>
          <Stack direction="row" align="center" gap="sm" className="ml-auto">
            {chrome.promote && doPromote && (
              <Button variant="ghost" onClick={doPromote} aria-label="Promote">
                <MdOpenInFull className="size-4" />
              </Button>
            )}
            {chrome.close && doClose && (
              <Button variant="ghost" onClick={doClose} aria-label="Close">
                <MdClose className="size-4" />
              </Button>
            )}
          </Stack>
        </Bar>
      }
      scrollBody={false}
      body={<Center className="h-full">{children}</Center>}
    />
  );
}
