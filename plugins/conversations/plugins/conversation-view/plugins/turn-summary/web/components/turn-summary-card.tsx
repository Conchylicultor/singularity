import { MdWarning, MdArrowForward } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  CollapsibleChevron,
  useCollapsible,
} from "@plugins/primitives/plugins/collapsible/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { turnSummariesResource } from "../../shared";

function parseBullets(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(" ").trim());
      buf = [];
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/g, "");
    const m = line.match(/^\s*[-*+]\s+(.*)$/);
    if (m && m[1] !== undefined) {
      flush();
      buf.push(m[1]);
    } else if (line.trim() === "") {
      flush();
    } else if (buf.length) {
      buf.push(line.trim());
    } else if (out.length === 0) {
      // Leading non-bullet text — treat as a single item.
      buf.push(line.trim());
    }
  }
  flush();
  return out.filter(Boolean);
}

export function TurnSummaryCard({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const result = useResource(turnSummariesResource);
  const { open, toggle } = useCollapsible({ defaultOpen: true });
  if (result.pending) return null;
  const summary = result.data[conversation.id];
  if (!summary) return null;

  const caveats = parseBullets(summary.caveats);
  const actions = parseBullets(summary.actions);
  const hasDetail = caveats.length > 0 || actions.length > 0;

  return (
    <Text as="div" variant="caption" className="rounded-md border border-border bg-muted/30 px-md py-sm">
      <button
        type="button"
        onClick={hasDetail ? toggle : undefined}
        className={`w-full text-left ${
          hasDetail ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={hasDetail ? open : undefined}
      >
        <Frame
          gap="xs"
          align="start"
          leading={
            hasDetail ? (
              // eslint-disable-next-line spacing/no-adhoc-spacing -- tiny top offset to baseline-align the chevron with the first line of summary text
              <CollapsibleChevron open={open} className="mt-0.5 size-3.5 text-muted-foreground" />
            ) : (
              // eslint-disable-next-line spacing/no-adhoc-spacing -- tiny top offset matching the chevron's, keeps the spacer placeholder aligned
              <span className="mt-0.5 size-3.5" />
            )
          }
          content={<span>{summary.summary || "(no summary)"}</span>}
        />
      </button>
      {hasDetail && open && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 separates this detail block from the always-visible summary button (sibling under a non-flex Text); ml-5 indents it under the chevron column
        <Stack gap="sm" className="mt-2 ml-5">
          {caveats.length > 0 && (
            <BulletList
              icon={
                // eslint-disable-next-line spacing/no-adhoc-spacing -- tiny top offset to baseline-align the bullet icon with its first text line
                <MdWarning className="mt-0.5 size-3 text-warning" />
              }
              items={caveats}
            />
          )}
          {actions.length > 0 && (
            <BulletList
              icon={
                // eslint-disable-next-line spacing/no-adhoc-spacing -- tiny top offset to baseline-align the bullet icon with its first text line
                <MdArrowForward className="mt-0.5 size-3 text-info" />
              }
              items={actions}
            />
          )}
        </Stack>
      )}
    </Text>
  );
}

function BulletList({
  icon,
  items,
}: {
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <Stack as="ul" gap="xs">
      {items.map((item, i) => (
        <Frame
          key={i}
          as="li"
          gap="xs"
          align="start"
          leading={icon}
          // A flow Stack resets Frame's single-line context so a multi-sentence
          // caveat/action wraps instead of clipping to one line.
          content={
            <Stack gap="none">
              <Text>{item}</Text>
            </Stack>
          }
        />
      ))}
    </Stack>
  );
}
