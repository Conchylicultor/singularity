import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSection,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { fillClasses } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Children, cloneElement, Fragment, isValidElement } from "react";
import type { IconType } from "react-icons";
import { MdCheck, MdExpandMore } from "react-icons/md";

export interface PickerPillProps {
  /** Leading glyph, always shown — it is what the pill is recognised by. */
  icon: IconType;
  /**
   * What the trigger reads while NOTHING is picked, in muted text. Also the
   * accessible name when `ariaLabel` is omitted.
   */
  placeholder: string;
  /**
   * Paint the accent-tinted "this is set" state. One pill, one highlight —
   * a fused pill (several groups) deliberately never tints, because "set"
   * would be ambiguous across its groups.
   */
  highlight?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** `PickerPill.Value` and `PickerPill.Group` children, in any order. */
  children?: React.ReactNode;
}

export interface PickerPillValueProps {
  /** Dim this value — used for every value after the first. */
  muted?: boolean;
  children: React.ReactNode;
}

export interface PickerPillGroupProps {
  /** Section heading inside the menu. */
  title: string;
  children?: React.ReactNode;
}

export interface PickerPillItemProps {
  /** Optional leading glyph for this row. */
  icon?: React.ReactNode;
  /** The current row of its group — draws a check instead of its note. */
  selected?: boolean;
  /** Dim trailing hint ("default", a shortcut, …), shown when not selected. */
  note?: string;
  onSelect: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export interface PickerPillCheckProps {
  /** Optional leading glyph for this row. */
  icon?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * The bar control: a pill reading `icon · value(s) · chevron` that opens one
 * grouped menu.
 *
 * **Several `Group`s in one pill IS the fused control** — the model and the
 * thinking mode read as `✦ Opus 5  Max` under a single trigger, and the menu
 * that opens has one heading per group with a check on each group's current
 * row. Nothing about that is a special case: a pill with one group is the same
 * component with one child.
 *
 * With no `Value` children the trigger shows `placeholder` in muted text — the
 * unset look, which is how "Preprompt" and "Dependency" read before you pick
 * anything.
 *
 * The trigger never wraps and never grows beyond what its own text needs, so a
 * pill on a single-line bar does not move its neighbours when you open it.
 */
export function PickerPill({
  icon: Icon,
  placeholder,
  highlight,
  disabled,
  ariaLabel,
  children,
}: PickerPillProps) {
  const { values, groups } = partition(children);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            shape="pill"
            variant={highlight ? "frame" : "ghost"}
            disabled={disabled}
            aria-label={ariaLabel ?? placeholder}
            className={cn(
              highlight &&
                "border-accent/60 bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
            )}
          />
        }
      >
        <Icon aria-hidden className="size-3.5" />
        {values.length > 0 ? (
          values.map((value, i) => cloneElement(value, { key: value.key ?? i }))
        ) : (
          <Text variant="control" tone="muted">
            {placeholder}
          </Text>
        )}
        <MdExpandMore className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {groups.map((group, i) => (
          <Fragment key={group.key ?? i}>
            {i > 0 && <DropdownMenuSeparator />}
            {group}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One piece of the trigger's text. The first reads at full strength and later
 * ones are `muted`, so a fused pill reads as "Opus 5, thinking Max" rather than
 * as two equal labels.
 */
function PickerPillValue({ muted, children }: PickerPillValueProps) {
  return (
    <Text variant="control" tone={muted ? "muted" : "default"}>
      {children}
    </Text>
  );
}

/** One headed section of the menu. */
function PickerPillGroup({ title, children }: PickerPillGroupProps) {
  return <DropdownMenuSection label={title}>{children}</DropdownMenuSection>;
}

/** One row of a group. */
function PickerPillItem({
  icon,
  selected,
  note,
  onSelect,
  disabled,
  children,
}: PickerPillItemProps) {
  return (
    <DropdownMenuItem disabled={disabled} onClick={onSelect} className="gap-lg">
      {/* The label is the row's one flexible cell, so the check / note below
          sits in its own track flush right instead of floating over it. */}
      <Stack
        as="span"
        direction="row"
        align="center"
        gap="xs"
        className={fillClasses("x")}
      >
        {icon}
        {children}
      </Stack>
      {selected ? (
        <MdCheck className="size-3.5 opacity-70" aria-hidden />
      ) : note ? (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      ) : null}
    </DropdownMenuItem>
  );
}

/**
 * A checkbox row of a group: an independent on/off option rather than one of a
 * group's mutually exclusive picks. Toggling it leaves the menu open, so
 * several checks can be flipped in one visit.
 */
function PickerPillCheck({
  icon,
  checked,
  onCheckedChange,
  disabled,
  children,
}: PickerPillCheckProps) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      closeOnClick={false}
      disabled={disabled}
      className="gap-lg"
    >
      {/* The checkbox item's grid already makes the label its one flexible
          (truncating) cell, with the check in its own track flush right. */}
      {icon}
      {children}
    </DropdownMenuCheckboxItem>
  );
}

type PillChild = React.ReactElement<
  PickerPillValueProps | PickerPillGroupProps
>;

/**
 * Split the declared children into the trigger's values and the menu's groups.
 *
 * Anything that is neither throws rather than vanishing: a stray child in a
 * compound component would otherwise simply not render, which looks exactly
 * like the value being unset.
 */
function partition(children: React.ReactNode): {
  values: PillChild[];
  groups: PillChild[];
} {
  const values: PillChild[] = [];
  const groups: PillChild[] = [];
  walk(children, (child) => {
    if (child.type === PickerPillValue) values.push(child);
    else if (child.type === PickerPillGroup) groups.push(child);
    else
      throw new Error(
        "PickerPill accepts only <PickerPill.Value> and <PickerPill.Group> children.",
      );
  });
  return { values, groups };
}

/** Visit every element child, descending through fragments. */
function walk(node: React.ReactNode, visit: (child: PillChild) => void): void {
  Children.forEach(node, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (isValidElement(child) && child.type === Fragment) {
      walk((child.props as { children?: React.ReactNode }).children, visit);
      return;
    }
    if (!isValidElement(child))
      throw new Error(
        "PickerPill accepts only <PickerPill.Value> and <PickerPill.Group> children.",
      );
    visit(child as PillChild);
  });
}

PickerPill.Value = PickerPillValue;
PickerPill.Group = PickerPillGroup;
PickerPill.Item = PickerPillItem;
PickerPill.Check = PickerPillCheck;
