import { MdNotificationsNone } from "react-icons/md";
import type { StructuredTag } from "../internal/parse-structured-tag";
import { FieldsCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/fields-card/web";

// "task-notification" → "Task notification". Natural case — jsonl-viewer bans
// all-caps labels.
function humanizeTag(tag: string): string {
  const spaced = tag.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : tag;
}

// One conventional field that doubles as the headline preview.
const SUMMARY_KEY = "summary";

/**
 * Pretty, generic rendering of a single harness tag block (see
 * {@link parseStructuredTag}). Delegates the whole "headline + summary preview +
 * fold-out fields" shape to {@link FieldsCard} — the same primitive the native
 * task-notification row uses — so the `summary` truncates in the header and the
 * full payload (every field, field-agnostically) stays one click away.
 */
export function StructuredTagCard({ structured }: { structured: StructuredTag }) {
  const { tag, fields } = structured;
  const summary = fields.find((f) => f.key.toLowerCase() === SUMMARY_KEY)?.value;
  const bodyFields = fields.filter((f) => f.key.toLowerCase() !== SUMMARY_KEY);

  return (
    <FieldsCard
      icon={<MdNotificationsNone className="size-3.5" />}
      label={<span className="font-medium">{humanizeTag(tag)}</span>}
      summary={summary}
      fields={bodyFields}
      mono
    />
  );
}
