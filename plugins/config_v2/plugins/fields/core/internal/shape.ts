import type React from "react";
import type { FieldDef, FieldsRecord, FieldType } from "@plugins/fields/core";

/**
 * One pickable choice, as DATA.
 *
 * `icon` is placed only where the vocabulary has room for it — the summary of a
 * `ControlPanel.Field`. A radio or check row's leading cell belongs to the
 * INDICATOR (invariant #3), so the icon is DROPPED there rather than pushed into
 * the label cell, which is what knocks a row's text off the rail.
 */
export interface ChoiceOption {
  readonly value: string;
  readonly label: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly hint?: string;
}

/**
 * WHAT A FIELD IS, as data.
 *
 * Six arms, and not one of them carries a label, a description, a padding, a
 * class, a row or a selection indicator. All of those are supplied by the ONE
 * host that maps a shape onto `ControlPanel` members (`FieldShapeView`). That
 * absence IS the mechanism: a renderer has nothing to draw chrome WITH, so
 * drawing it is unspellable rather than discouraged.
 *
 * The selection arms line up 1:1 with invariant #3's three languages:
 *
 *   toggle               → select="switch"
 *   choice select="one"  → select="radio"
 *   choice select="many" → select="check"
 *
 * There is no fourth here, for the same reason there is no fourth there.
 *
 * No arm is assignable from `React.ReactElement` either (an element carries
 * `type`/`props`/`key` and no `kind`), so a renderer that returns its own JSX
 * does not compile.
 */
export type FieldShape =
  | { kind: "toggle"; checked: boolean; onToggle: () => void }
  | {
      kind: "choice";
      select: "one" | "many";
      options: readonly ChoiceOption[];
      /** `"one"` → zero or one entry; `"many"` → the chosen set. */
      value: readonly string[];
      onSelect: (value: string) => void;
    }
  | {
      kind: "value";
      /**
       * THE ESCAPE HATCH — and it does not reopen label-drawing, because this
       * element lands in the VALUE CELL of a `Setting`, where a label is
       * meaningless and self-applied padding is visible as a mistake. No label
       * reaches this far; there is nowhere to put one.
       */
      control: React.ReactElement;
      fit: "field" | "inline";
    }
  | {
      kind: "block";
      /**
       * A control too wide for a row: a textarea, a code box, a chip cluster, a
       * drag editor. It lands on the panel's rail by doing nothing.
       */
      control: React.ReactElement;
    }
  | {
      kind: "group";
      fields: FieldsRecord;
      values: Record<string, unknown>;
      onChangeField: (key: string, value: unknown) => void;
    }
  | {
      kind: "list";
      /**
       * An item is ITSELF a shape — so a list of records and a list of scalars
       * are one arm, and `string-list` stops being its own layout.
       */
      items: readonly { readonly id: string; readonly shape: FieldShape }[];
      onAdd?: () => void;
      onRemove?: (id: string) => void;
      onMove?: (activeId: string, overId: string) => void;
      addLabel?: string;
    };

export interface FieldShapeProps<T = unknown> {
  field: FieldDef<T>;
  value: T;
  onChange: (value: T) => void;
}

export interface FieldShapeRenderer<T = unknown> {
  readonly type: FieldType<T>;
  /**
   * A HOOK. It may call hooks (`useLocalValue`, `useResource`,
   * `useContributions`) and returns the field's SHAPE, never JSX — so every
   * presentation decision is made once, by the shape's host, rather than
   * eighteen times.
   *
   * Because it is a hook rather than a component, its hook call ORDER must be
   * unconditional. A renderer whose control depends on a hook it can only reach
   * once some other condition holds keeps that hook behind a component of its
   * own and returns a `value` / `block` arm carrying it.
   */
  readonly useShape: (props: FieldShapeProps<T>) => FieldShape;
}
