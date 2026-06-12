import { Text } from "@plugins/primitives/plugins/text/web";
import type { SystemAgentDescriptor } from "../system-agents";

export function SystemAgentDetail({
  descriptor,
}: {
  descriptor: SystemAgentDescriptor;
}) {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Text as="h1" variant="title">{descriptor.name}</Text>
      <Text as="p" variant="caption" className="text-muted-foreground italic">
        This system agent has no custom UI yet.
      </Text>
    </div>
  );
}
