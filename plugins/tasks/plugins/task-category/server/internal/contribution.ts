import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// Registry of task categories. Each filing plugin contributes its own category
// (id + label + order); consumers read only the generic aggregate (the list
// endpoint + the grouped tasks view) — a category id is never hardcoded in a
// consumer.
export const TaskCategory = defineServerContribution<{
  id: string;
  label: string;
  order?: number;
}>("taskCategory", { docLabel: (c) => c.id });
