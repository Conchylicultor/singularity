import { useState } from "react";
import { MdAutoAwesome, MdClose } from "react-icons/md";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
 *
 * The chip opens a CONTROL PANEL. Which item is set is a single choice, so the
 * rows speak the one radio language (`select="radio"`) instead of the checkmark
 * this file used to fade in and out by opacity; the rule between the items and
 * the actions is the panel's own, drawn because the actions are a `Footer` band
 * rather than because a `h-px` div was placed there; and those footer actions
 * take `trailing` glyphs, so one ✕ down there cannot indent every item above it.
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

  const run = async (
    kind: Exclude<Busy, null>,
    action: () => Promise<void>,
    failure: string,
  ) => {
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
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      // A list of choices — the `menu` role.
      size="menu"
      label={categoryName}
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
    >
      <ControlPanel.Section
        // The band's own label, with the "configure this category" gear beside
        // it — the pair `ConfigPopoverHeader` used to draw as a padded row of
        // its own, which would have brought a second inset into a panel that
        // already owns one.
        label={
          <Stack
            direction="row"
            gap="sm"
            align="center"
            justify="between"
            className="w-full"
          >
            {categoryName}
            <ConfigGearButton
              descriptor={conversationCategoryConfig}
              label={`Configure: ${categoryName}`}
            />
          </Stack>
        }
      >
        {category.items.map((option) => (
          <ControlPanel.Row
            key={option.id}
            select="radio"
            checked={option.name === item}
            disabled={busy !== null}
            onSelect={() =>
              void run(
                "set",
                () => setCategoryItem(conversationId, category.id, option.name),
                `Failed to set ${categoryName}`,
              )
            }
          >
            {option.name}
            {option.hint ? (
              <Text as="span" variant="body" tone="muted">
                {" "}
                — {option.hint}
              </Text>
            ) : null}
          </ControlPanel.Row>
        ))}
      </ControlPanel.Section>
      <ControlPanel.Footer>
        {item ? (
          <ControlPanel.Row
            trailing={<MdClose />}
            disabled={busy !== null}
            onSelect={() =>
              void run(
                "clear",
                () => clearCategory(conversationId, category.id),
                `Failed to clear ${categoryName}`,
              )
            }
          >
            Clear
          </ControlPanel.Row>
        ) : null}
        <ControlPanel.Row
          trailing={
            <MdAutoAwesome
              className={busy === "classify" ? "animate-pulse" : undefined}
            />
          }
          disabled={busy !== null}
          onSelect={() =>
            void run(
              "classify",
              () => reclassify(conversationId, [category.id]),
              "Re-classify failed",
            )
          }
        >
          {busy === "classify"
            ? "Re-classifying…"
            : `Re-classify ${categoryName}`}
        </ControlPanel.Row>
        {/* Every category in one Haiku call — the alternative, clicking each chip
            in turn, spawns one `claude` process per category. */}
        <ControlPanel.Row
          trailing={<MdAutoAwesome />}
          disabled={busy !== null}
          onSelect={() =>
            void run(
              "classify",
              () => reclassify(conversationId),
              "Re-classify failed",
            )
          }
        >
          Re-classify all categories
        </ControlPanel.Row>
      </ControlPanel.Footer>
    </ControlPanelPopover>
  );
}
