import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { BoundaryErrorReport } from "./reporter";

export const ErrorBoundary = {
  Action: defineSlot<{
    component: ComponentType<{
      report: BoundaryErrorReport;
      context: unknown;
    }>;
  }>("error-boundary.action"),
};
