import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// Registry of system container/meta task ids. Each meta-owning plugin
// contributes its own id; consumers read only the generic aggregate below —
// the list of ids is never hardcoded in a consumer.
export const ContainerTask = defineServerContribution<{ id: string }>(
  "containerTask",
);
