import type { ComponentType } from "react";

export interface SystemAgentDescriptor {
  id: string;
  name: string;
  icon?: ComponentType<{ className?: string }>;
  component?: ComponentType<{ descriptor: SystemAgentDescriptor }>;
}

export function defineSystemAgent(
  d: SystemAgentDescriptor,
): SystemAgentDescriptor {
  if (!/^[a-z][a-z0-9-]*$/.test(d.id)) {
    throw new Error(
      `defineSystemAgent("${d.id}"): id must match /^[a-z][a-z0-9-]*$/`,
    );
  }
  return d;
}
