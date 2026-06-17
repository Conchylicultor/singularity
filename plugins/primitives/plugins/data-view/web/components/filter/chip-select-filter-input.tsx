import { useState, type ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import type { FilterValueInputProps } from "../../../core";

/**
 * The shared option-select operand editor for enum/tags-style filters. Instead of
 * spilling every `field.options` chip inline into the rule row's narrow `flex-1`
 * value cell (where dozens of options collapse into a truncated one-per-line
 * column — unreadable), it renders a compact picker-style trigger summarizing the
 * selection (mirroring the sibling field/operator pickers) and opens a roomy
 * popover with a search box + a wrapping, never-truncated chip grid. This is the
 * filter-side twin of the inline tags cell editor, so picking options feels
 * identical wherever a tag/enum field appears.
 *
 * `multiple` switches the operand shape: a `string[]` of toggled values
 * (contains-any/all, is-any-of/none-of) vs. a single `string` (contains /
 * is / is-not). Single-select closes the popover on pick; multi stays open so
 * several can be toggled in one pass.
 */
export function ChipSelectFilterInput(
  props: FilterValueInputProps & { multiple: boolean },
): ReactNode {
  const { multiple } = props;
  const options = props.field.options ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = multiple
    ? Array.isArray(props.value)
      ? (props.value as string[])
      : []
    : typeof props.value === "string" && props.value
      ? [props.value]
      : [];

  const labelFor = (v: string) =>
    options.find((o) => o.value === v)?.label ?? v;

  function pick(v: string) {
    if (multiple) {
      const next = selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v];
      props.onChange(next.length > 0 ? next : undefined);
    } else {
      props.onChange(selected[0] === v ? undefined : v);
      setOpen(false);
    }
  }

  const first = selected[0];
  const summary =
    first === undefined
      ? null
      : selected.length === 1
        ? labelFor(first)
        : `${selected.length} selected`;

  const q = query.trim().toLowerCase();
  const visible = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q),
      )
    : options;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-64"
      trigger={
        <Button variant="outline" size="sm" aria-label="Select filter values">
          {summary === null ? (
            <span className="text-muted-foreground">Select…</span>
          ) : (
            <span className="truncate">{summary}</span>
          )}
          <MdExpandMore />
        </Button>
      }
    >
      <Stack gap="sm">
        {options.length > 6 && (
          <Input
            autoFocus
            className="h-6 px-xs py-none"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {visible.length > 0 ? (
          <Stack direction="row" gap="xs" wrap>
            {visible.map((o) => (
              <ToggleChip
                key={o.value}
                active={selected.includes(o.value)}
                variant="ghost"
                size="sm"
                onClick={() => pick(o.value)}
              >
                {o.label}
              </ToggleChip>
            ))}
          </Stack>
        ) : (
          <Placeholder tone="muted">No matches</Placeholder>
        )}
      </Stack>
    </InlinePopover>
  );
}
