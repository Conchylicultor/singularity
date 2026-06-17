import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { SystemAgentDescriptor } from "../system-agents";

export function SystemAgentDetail({
  descriptor,
}: {
  descriptor: SystemAgentDescriptor;
}) {
  return (
    <div className="flex flex-col gap-md p-xl">
      <Text as="h1" variant="title">{descriptor.name}</Text>
      <Text as="p" variant="caption" className="text-muted-foreground italic">
        This system agent has no custom UI yet.
      </Text>
    </div>
  );
}
