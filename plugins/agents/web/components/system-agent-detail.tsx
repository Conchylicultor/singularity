import type { SystemAgentDescriptor } from "../system-agents";

export function SystemAgentDetail({
  descriptor,
}: {
  descriptor: SystemAgentDescriptor;
}) {
  return (
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">{descriptor.name}</h1>
      <p className="text-muted-foreground text-xs italic">
        This system agent has no custom UI yet.
      </p>
    </div>
  );
}
