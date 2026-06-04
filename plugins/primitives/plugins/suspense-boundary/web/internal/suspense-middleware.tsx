import { Suspense, type ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";

// Wraps each slot contribution in a Suspense boundary so a suspending child (e.g.
// useConfig before its config has loaded) renders a small local spinner instead of
// bubbling up to an ancestor boundary and blanking a larger region. Registered at a
// higher priority than the error boundary so it sits *inside* it — the error
// boundary stays outermost and still catches genuine render errors.
export function SuspenseMiddleware({
  children,
}: {
  slotId: string;
  contribution: Contribution;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<Spinner className="text-muted-foreground m-2 size-4" />}>
      {children}
    </Suspense>
  );
}
