import type { ComponentType, ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineRenderSlot,
  renderIsolated,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type {
  FieldDef,
  FieldExtensionProps,
  FieldExtensionsDescriptor,
} from "../../core";

export interface FieldExtensionContribution<TRow> {
  id: string;
  component: ComponentType<FieldExtensionProps<TRow>>;
  order?: number;
}

/**
 * The minted value. Unlike `ItemActions` (whose `ItemActionsDescriptor` adds a
 * *new* `.Row` member), the `FieldExtensionsDescriptor` surface (`id` +
 * `useContributions`) is ALREADY provided by `RenderSlot` — so we extend only
 * `RenderSlot` (extending both would be a duplicate-member conflict, TS2320). The
 * slot is structurally assignable to `FieldExtensionsDescriptor`, which is all the
 * `fieldExtensions` prop needs.
 */
export interface FieldExtensions<TRow>
  extends RenderSlot<FieldExtensionContribution<TRow>> {}

/**
 * Mint a per-consumer field-extension slot. The returned value is **callable for
 * contributions** (`MyFields({ id, component })`, like any `defineRenderSlot`
 * result) and — being a slot — already exposes the `FieldExtensionsDescriptor`
 * surface (`id` + `useContributions`) the host reads. Mirrors `defineItemActions`:
 * disjoint row types per consumer → a factory, not a global slot.
 *
 * Pass the result to `<DataView fieldExtensions={MyFields} />`; the host folds
 * every contributor's `FieldDef[]` into the schema before the sort/filter
 * controllers, so contributed fields appear in the Sort/Filter pills and table
 * columns for free.
 */
export function defineFieldExtensions<TRow>(id: string): FieldExtensions<TRow> {
  return defineRenderSlot<FieldExtensionContribution<TRow>>(id, {
    docLabel: (p) => p.id,
  });
}

/**
 * Host fold. Reads the descriptor's contributions and **recursively** mounts
 * each one, threading the accumulated fields through nested render-callbacks:
 * every contributor mounts (running its own hooks), hands back its `FieldDef[]`
 * via `render`, and that recurses to the next contributor — finally calling
 * `children([...base, ...allExtra])`.
 *
 * Written as a recursive COMPONENT, never a `.map` over contributed hooks:
 * mounting each contributor as its own React element keeps the per-component hook
 * order stable (the contribution set is fixed at build time → recursion depth is
 * stable → `react-hooks/rules-of-hooks` is satisfied). No descriptor / empty set
 * → `children(base)` directly.
 *
 * This generalizes Sonata's deleted `Library.Sort` render-callback to the field
 * level.
 */
export function CollectFieldExtensions<TRow>(props: {
  descriptor?: FieldExtensionsDescriptor<TRow>;
  base: FieldDef<TRow>[];
  children: (fields: FieldDef<TRow>[]) => ReactNode;
}): ReactNode {
  const { descriptor, base, children } = props;
  // The common case: most consumers declare no field extensions. Skip the fold
  // entirely (no `useContributions` subscription) and hand back the base fields.
  if (!descriptor) return <>{children(base)}</>;
  return <FieldExtensionFold descriptor={descriptor} base={base} emit={children} />;
}

/** Reads `useContributions()` once, then kicks off the recursive fold. */
function FieldExtensionFold<TRow>(props: {
  descriptor: FieldExtensionsDescriptor<TRow>;
  base: FieldDef<TRow>[];
  emit: (fields: FieldDef<TRow>[]) => ReactNode;
}): ReactNode {
  const { descriptor, base, emit } = props;
  const contributions = descriptor.useContributions();
  return (
    <FieldExtensionStep
      slotId={descriptor.id}
      contributions={contributions}
      index={0}
      acc={base}
      emit={emit}
    />
  );
}

/** One fold level: mount contribution `index` isolated; its `render` recurses to
 *  the next level with the accumulated fields. Base case → emit the merged set. */
function FieldExtensionStep<TRow>(props: {
  slotId: string;
  contributions: ReturnType<FieldExtensionsDescriptor<TRow>["useContributions"]>;
  index: number;
  acc: FieldDef<TRow>[];
  emit: (fields: FieldDef<TRow>[]) => ReactNode;
}): ReactNode {
  const { slotId, contributions, index, acc, emit } = props;
  // Every contributor has mounted and folded its fields into `acc` → emit.
  if (index >= contributions.length) return <>{emit(acc)}</>;

  const contribution = contributions[index]!;
  const renderProps: FieldExtensionProps<TRow> = {
    render: (fields) => (
      <FieldExtensionStep
        slotId={slotId}
        contributions={contributions}
        index={index + 1}
        acc={[...acc, ...fields]}
        emit={emit}
      />
    ),
  };
  // `renderIsolated` unseals the contribution's component and wraps it in the
  // error-boundary item middleware, so a broken contributor never crashes the
  // whole DataView (and never poisons the merged schema).
  return renderIsolated(
    slotId,
    contribution as unknown as Contribution,
    renderProps,
  );
}
