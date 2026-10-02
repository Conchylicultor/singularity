import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { useConversationFieldDefs } from "@plugins/conversations/plugins/all-conversations/web";
import type { QueueRow } from "./use-queue-rows";

const SECTION_FIELD: FieldDef<QueueRow> = {
  id: "section",
  label: "Section",
  type: "enum",
  value: (r) => r.section,
  groupable: true,
  filterable: false,
  options: [
    { value: "pinned", label: "Pinned" },
    { value: "queued", label: "Queue" },
    { value: "working", label: "Working" },
    { value: "unranked", label: "Unranked" },
    { value: "disconnected", label: "Disconnected" },
    { value: "done", label: "Done" },
  ],
};

/**
 * The Queue DataView field schema: the shared conversation display fields (reused
 * verbatim from `all-conversations`, forced non-groupable so the gear's group-by
 * picker offers only `section` + `None`) plus the synthetic `section` field that
 * drives the read-time partitioning. The `FieldDef<Conversation>` → `FieldDef<QueueRow>`
 * cast is safe — `QueueRow` extends `Conversation` and `TRow` appears only in
 * contravariant (accessor) positions (the DataView docs sanction this cast).
 */
export function useQueueFields(): FieldDef<QueueRow>[] {
  const conversationFields = useConversationFieldDefs();
  return [
    ...(conversationFields as FieldDef<QueueRow>[]).map((f) => ({
      ...f,
      groupable: false,
    })),
    SECTION_FIELD,
  ];
}
