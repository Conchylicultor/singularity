import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReactNode } from "react";
import { PluginErrorBoundary } from "../components/plugin-error-boundary";

export function ErrorBoundaryMiddleware({
  slotId,
  contribution,
  children,
}: {
  slotId: string;
  contribution: Contribution;
  children: ReactNode;
}) {
  return (
    <PluginErrorBoundary slot={slotId} label={contribution._pluginName}>
      {children}
    </PluginErrorBoundary>
  );
}
