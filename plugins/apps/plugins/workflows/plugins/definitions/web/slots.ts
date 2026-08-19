import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";

/**
 * Sections of the workflow-detail pane. The host paints every contribution as a
 * collapsible `SectionCard`, so a section supplies a `label` and a body and
 * never its own card or title.
 *
 * The factory id is `"workflows.detail"` — NOT `"workflows"` — because the
 * emitted slot id is `` `${id}.section` `` verbatim and
 * `reorderDirectiveDescriptor` uses a slot id verbatim as its config_v2 config
 * name. `workflows.detail.section` is what this pane's persisted section order
 * is already keyed by; changing the string would silently reset it.
 */
export const WorkflowsDetail = defineDetailSections<{ definitionId: string }>();
