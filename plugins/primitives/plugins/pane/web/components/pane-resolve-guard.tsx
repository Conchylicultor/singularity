import type { ComponentType } from "react";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import type { PaneInternal, ResolveHook } from "../pane";

interface Props {
  pane: PaneInternal;
  params: Record<string, string>;
}

export function PaneResolveGuard({ pane, params }: Props) {
  if (!pane.resolve) {
    const Component = pane.component;
    return <Component />;
  }
  return <ResolveGuardInner resolve={pane.resolve} component={pane.component} params={params} />;
}

function ResolveGuardInner({
  resolve,
  component: Component,
  params,
}: {
  resolve: ResolveHook<Record<string, string>>;
  component: ComponentType;
  params: Record<string, string>;
}) {
  const { pending, found } = resolve(params);

  if (found) return <Component />;

  if (pending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Placeholder>Loading…</Placeholder>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center border-b px-3">
        <span className="text-sm font-medium text-muted-foreground">Not Found</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Placeholder tone="error">
          This link refers to a resource that no longer exists.
        </Placeholder>
      </div>
    </div>
  );
}
