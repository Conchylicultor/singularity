import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { SystemAgentDescriptor } from "../system-agents";

export function SystemAgentDetail({
  descriptor,
}: {
  descriptor: SystemAgentDescriptor;
}) {
  return (
    <Inset pad="xl">
      <Stack gap="md">
        <Text as="h1" variant="title">{descriptor.name}</Text>
        <Text as="p" variant="caption" className="text-muted-foreground italic">
          This system agent has no custom UI yet.
        </Text>
      </Stack>
    </Inset>
  );
}
