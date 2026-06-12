import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import type { ComponentType, ReactNode } from "react";
import { MdClose, MdOpenInFull } from "react-icons/md";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
  return (
    <ResolveGuardInner
      pane={pane}
      resolve={pane.resolve}
      component={pane.component}
      params={params}
    />
  );
}

function ResolveGuardInner({
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

  if (found) return <Component />;

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
        This link refers to a resource that no longer exists.
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
    <div className="flex h-full flex-col">
      <div className="flex h-chrome-pane items-center gap-sm border-b px-chrome">
        <Text as="span" variant="label" tone="muted" className="truncate">
          {title}
        </Text>
        <div className="flex-1" />
        {chrome.promote && doPromote && (
          <Button variant="ghost" size="sm" onClick={doPromote} aria-label="Promote">
            <MdOpenInFull className="size-4" />
          </Button>
        )}
        {chrome.close && doClose && (
          <Button variant="ghost" size="sm" onClick={doClose} aria-label="Close">
            <MdClose className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}
