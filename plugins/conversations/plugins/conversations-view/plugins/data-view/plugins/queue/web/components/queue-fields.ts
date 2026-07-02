import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import { conversationFieldDefs } from "@plugins/conversations/plugins/all-conversations/web";
import type { QueueRow } from "./use-queue-rows";

/**
 * The Queue DataView field schema: the shared conversation display fields (reused
 * verbatim from `all-conversations`, forced non-groupable so the gear's group-by
 * picker offers only `section` + `None`) plus the synthetic `section` field that
 * drives the read-time partitioning. The `FieldDef<Conversation>` → `FieldDef<QueueRow>`
 * cast is safe — `QueueRow` extends `Conversation` and `TRow` appears only in
 * contravariant (accessor) positions (the DataView docs sanction this cast).
 */
export const queueFields: FieldDef<QueueRow>[] = [
  ...(conversationFieldDefs as FieldDef<QueueRow>[]).map((f) => ({
    ...f,
    groupable: false,
  })),
  {
    id: "section",
    label: "Section",
    type: "enum",
    value: (r) => r.section,
    groupable: true,
    filterable: false,
    options: [
      { value: "current", label: "Current" },
      { value: "queued", label: "Queue" },
      { value: "working", label: "Working" },
      { value: "unranked", label: "Unranked" },
      { value: "disconnected", label: "Disconnected" },
      { value: "done", label: "Done" },
    ],
  },
];
