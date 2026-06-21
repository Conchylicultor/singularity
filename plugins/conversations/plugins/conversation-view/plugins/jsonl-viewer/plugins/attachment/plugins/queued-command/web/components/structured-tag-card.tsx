import { MdNotificationsNone } from "react-icons/md";
import type { StructuredTag } from "../internal/parse-structured-tag";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

// "task-notification" → "Task notification". Natural case — jsonl-viewer bans
// all-caps labels.
function humanizeTag(tag: string): string {
  const spaced = tag.replace(/[-_]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : tag;
}

// One conventional field that doubles as a headline. Everything else (and this
// too, when it can't be lifted) still renders in the body — nothing is hidden.
const SUMMARY_KEY = "summary";

/**
 * Pretty, generic rendering of a single harness tag block (see
 * {@link parseStructuredTag}). The headline carries the humanized tag name plus
 * the `summary` field when present; the remaining fields fold behind the card's
 * chevron, so the timeline stays a calm one-liner while every field the payload
 * carries — including ones added in a future format — remains one click away.
 */
export function StructuredTagCard({ structured }: { structured: StructuredTag }) {
  const { tag, fields } = structured;
  const summary = fields.find((f) => f.key.toLowerCase() === SUMMARY_KEY)?.value;
  // Lift `summary` into the headline only when other fields remain for the body;
  // otherwise keep it in the body so the card never expands to nothing.
  const liftSummary = !!summary && fields.length > 1;
  const bodyFields = liftSummary
    ? fields.filter((f) => f.key.toLowerCase() !== SUMMARY_KEY)
    : fields;

  return (
    <CollapsibleCard
      icon={<MdNotificationsNone className="size-3.5" />}
      label={
        <div className="flex items-center gap-xs">
          <span className="font-medium">{humanizeTag(tag)}</span>
          {liftSummary && (
            <div className="min-w-0">
              <Text>{summary}</Text>
            </div>
          )}
        </div>
      }
    >
      <Stack gap="xs">
        {bodyFields.map((f) => (
          <Text
            key={f.key}
            as="div"
            variant="caption"
            className="whitespace-pre-wrap break-words font-mono text-muted-foreground"
          >
            <span className="text-muted-foreground/60">{f.key}: </span>
            {f.value}
          </Text>
        ))}
      </Stack>
    </CollapsibleCard>
  );
}
