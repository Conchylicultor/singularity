import { useState } from "react";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { InlineText } from "@plugins/primitives/plugins/inline-text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { copiesAsText } from "@plugins/primitives/plugins/dom/plugins/copy-source-text/core";
import { goWire, parseGo, type GoItem } from "../internal/parse-go";
import { GoChip } from "./go-chip";

/**
 * A multi-line `<go>`: the suggested prompt as a tinted block with the Go chip
 * at its foot. A `- [ ]` checklist inside becomes pickable rows; the chip sends
 * only the picked lines (the prose is for the reader), and stays unsendable
 * until one is picked (✎ with none picked hands over every item to trim).
 */
export function GoBlock({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const body = parseGo(content);
  const [picked, setPicked] = useState(() => body.items.map((i) => i.checked));

  if (body.items.length === 0) {
    return (
      <Stack gap="xs" className="rounded-md bg-primary/5 px-md py-xs">
        <Markdown>{content}</Markdown>
        <Stack direction="row" gap="none" justify="end">
          <GoChip wire={goWire(content, [])} />
        </Stack>
      </Stack>
    );
  }

  const count = picked.filter(Boolean).length;
  const toggle = (i: number) =>
    setPicked((prev) => prev.map((on, j) => (j === i ? !on : on)));

  return (
    <Stack gap="xs" className="rounded-md bg-primary/5 px-md py-sm">
      {body.lead && <Markdown>{body.lead}</Markdown>}
      <Stack gap="none">
        {body.items.map((item, i) => (
          <GoItemRow
            key={i}
            item={item}
            checked={picked[i]!}
            onToggle={() => toggle(i)}
          />
        ))}
      </Stack>
      {body.tail && <Markdown>{body.tail}</Markdown>}
      <Stack direction="row" gap="sm" align="center" justify="end">
        <Text variant="caption" tone="muted" className="select-none">
          {count === 0
            ? "Pick the ones to send"
            : `${count} of ${picked.length} picked`}
        </Text>
        <GoChip
          wire={goWire(content, picked)}
          draft={goWire(
            content,
            count === 0 ? body.items.map(() => true) : picked,
          )}
          ready={count > 0}
        />
      </Stack>
    </Stack>
  );
}

function GoItemRow({
  item,
  checked,
  onToggle,
}: {
  item: GoItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Stack
      as="button"
      direction="row"
      gap="sm"
      align="start"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      // Copies as the line the agent wrote, with its current tick.
      {...copiesAsText(`- [${checked ? "x" : " "}] ${item.text}\n`)}
      className="w-full rounded-sm px-xs py-2xs text-left transition-colors hover:bg-primary/10"
    >
      {/* pt-xs seats the box on the label's first line. */}
      <Stack gap="none" className="pt-xs">
        <CheckboxIndicator checked={checked} />
      </Stack>
      <Fill>
        <InlineText text={item.text} />
      </Fill>
    </Stack>
  );
}
