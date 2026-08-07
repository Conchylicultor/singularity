import { useState } from "react";
import { MdAutoAwesome, MdCheck, MdClose } from "react-icons/md";
import { ConfigPopoverHeader } from "@plugins/config_v2/plugins/config-link/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { conversationCategoryConfig } from "../../shared";
import type { Category } from "../internal/use-categories";
import { clearCategory, reclassify, setCategoryItem } from "../internal/api";

type Busy = "classify" | "set" | "clear" | null;

/**
 * One category's chip in the conversation header: the item it is set to, or the
 * category's own name in muted type when it is unset.
 *
 * Every category keeps its own chip rather than collapsing unset ones behind a
 * counter — "Priority is not set" is exactly the triage signal the header is
 * there to give, and hiding it behind a `+2` costs a click to discover.
 * `CollapsibleWrap` in the header already handles a crowded row.
 *
 * The assignment arrives as a prop: the whole header shares ONE subscription, so
 * a chip never opens its own.
 */
export function CategoryChip({
  conversationId,
  category,
  item,
}: {
  conversationId: string;
  category: Category;
  item: string | null;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [open, setOpen] = useState(false);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
      setOpen(false);
    } catch (err) {
      toast({
        type: "conversation",
        title: failure,
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  // A category added in Settings has no name until the user types one, and an
  // empty chip reads as a rendering bug rather than as "name me".
  const categoryName = category.name.trim() || "Untitled category";
  const label = item ?? categoryName;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Badge
          as="button"
          variant="muted"
          // An unset category is present but empty — dim it so a glance
          // separates "P0" from "Priority, unanswered".
          className={item ? "hover:opacity-80" : "opacity-60 hover:opacity-90"}
          aria-label={
            item ? `${categoryName}: ${item}` : `${categoryName}: not set`
          }
          title={category.hint || undefined}
          icon={
            busy === "classify" ? (
              <MdAutoAwesome className="size-3 animate-pulse" />
            ) : undefined
          }
        >
          {label}
        </Badge>
      }
      width="sm"
      padding="xs"
    >
      <ConfigPopoverHeader
        label={categoryName}
        descriptor={conversationCategoryConfig}
      />
      <ul className="space-y-px">
        {category.items.map((option) => {
          const selected = option.name === item;
          return (
            <li key={option.id}>
              <Row
                size="sm"
                hover="accent"
                onClick={() =>
                  run(
                    "set",
                    () => setCategoryItem(conversationId, category.id, option.name),
                    `Failed to set ${categoryName}`,
                  )
                }
                disabled={busy !== null}
                title={option.hint || undefined}
                icon={
                  <Center
                    as="span"
                    className={`size-3 ${selected ? "opacity-100" : "opacity-0"}`}
                  >
                    <MdCheck className="size-3" />
                  </Center>
                }
              >
                {option.name}
                {option.hint ? (
                  <span className="truncate text-muted-foreground"> — {option.hint}</span>
                ) : null}
              </Row>
            </li>
          );
        })}
      </ul>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off vertical offset on a 1px divider between the item list and the actions */}
      <div className="my-1 h-px bg-border" />
      {item ? (
        <Row
          size="sm"
          hover="accent"
          onClick={() =>
            run(
              "clear",
              () => clearCategory(conversationId, category.id),
              `Failed to clear ${categoryName}`,
            )
          }
          disabled={busy !== null}
          icon={<MdClose />}
        >
          Clear
        </Row>
      ) : null}
      <Row
        size="sm"
        hover="accent"
        onClick={() =>
          run(
            "classify",
            () => reclassify(conversationId, [category.id]),
            "Re-classify failed",
          )
        }
        disabled={busy !== null}
        icon={
          <MdAutoAwesome
            className={busy === "classify" ? "animate-pulse" : undefined}
          />
        }
      >
        {busy === "classify" ? "Re-classifying…" : `Re-classify ${categoryName}`}
      </Row>
      {/* Every category in one Haiku call — the alternative, clicking each chip
          in turn, spawns one `claude` process per category. */}
      <Row
        size="sm"
        hover="accent"
        onClick={() =>
          run("classify", () => reclassify(conversationId), "Re-classify failed")
        }
        disabled={busy !== null}
        icon={<MdAutoAwesome />}
      >
        Re-classify all categories
      </Row>
    </InlinePopover>
  );
}
