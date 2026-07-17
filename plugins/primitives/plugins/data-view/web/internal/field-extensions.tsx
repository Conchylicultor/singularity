import type { ComponentType, ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import {
  defineRenderSlot,
  renderIsolated,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";
import type {
  DataViewId,
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
 * Host fold. Folds an ORDERED LIST of field-extension sources into one merged
 * schema: it recursively mounts each contributor of `sources[0]`, then each of
 * `sources[1]`, etc., threading the accumulated fields through nested
 * render-callbacks — every contributor mounts (running its own hooks), hands back
 * its `FieldDef[]` via `render`, and that recurses to the next contributor (then
 * the next source) — finally calling `children([...base, ...allExtra])`.
 *
 * The one call site passes `[DataViewSlots.FieldExtension, ...(fieldExtensions
 * prop if present)]`: the always-on global slot first (cross-cutting contributors
 * like custom-columns), then the optional per-consumer factory (Sonata's typed
 * fields). Both share this one fold; `{ storageKey, rowKey }` is threaded to every
 * contributor, and a contributor that doesn't need the coordinates ignores them.
 *
 * Written as recursive COMPONENTS (both source-level and contribution-level),
 * never a `.map` over contributed hooks: mounting each source/contributor as its
 * own React element keeps the per-component hook order stable (the source list and
 * each contribution set are fixed at build time → recursion depth is stable →
 * `react-hooks/rules-of-hooks` is satisfied). Empty source list → `children(base)`
 * directly.
 *
 * This generalizes Sonata's deleted `Library.Sort` render-callback to the field
 * level.
 */
export function CollectFieldExtensions(props: {
  sources: FieldExtensionsDescriptor<unknown>[];
  base: FieldDef<unknown>[];
  /** Surface coordinates threaded into every contribution's render props alongside
   *  `render`, so a contributor can key its per-row data over the surface. */
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  children: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { sources, base, storageKey, rowKey, children } = props;
  return (
    <FieldExtensionSourceStep
      sources={sources}
      index={0}
      acc={base}
      storageKey={storageKey}
      rowKey={rowKey}
      emit={children}
    />
  );
}

/** One source-level fold level: fold every contribution of `sources[index]` into
 *  `acc`, then recurse to the next source. Base case (all sources folded) → emit
 *  the merged set. A source with zero contributions passes its accumulator
 *  through (via `FieldExtensionFold`'s own base case). */
function FieldExtensionSourceStep(props: {
  sources: FieldExtensionsDescriptor<unknown>[];
  index: number;
  acc: FieldDef<unknown>[];
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  emit: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { sources, index, acc, storageKey, rowKey, emit } = props;
  // Every source has folded its contributions into `acc` → emit.
  if (index >= sources.length) return <>{emit(acc)}</>;
  return (
    <FieldExtensionFold
      descriptor={sources[index]!}
      base={acc}
      storageKey={storageKey}
      rowKey={rowKey}
      emit={(merged) => (
        <FieldExtensionSourceStep
          sources={sources}
          index={index + 1}
          acc={merged}
          storageKey={storageKey}
          rowKey={rowKey}
          emit={emit}
        />
      )}
    />
  );
}

/** Reads one source's `useContributions()` once, then kicks off the recursive
 *  contribution-level fold. */
function FieldExtensionFold(props: {
  descriptor: FieldExtensionsDescriptor<unknown>;
  base: FieldDef<unknown>[];
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  emit: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { descriptor, base, storageKey, rowKey, emit } = props;
  const contributions = descriptor.useContributions();
  return (
    <FieldExtensionStep
      slotId={descriptor.id}
      contributions={contributions}
      index={0}
      acc={base}
      storageKey={storageKey}
      rowKey={rowKey}
      emit={emit}
    />
  );
}

/** One fold level: mount contribution `index` isolated; its `render` recurses to
 *  the next level with the accumulated fields. Base case → emit the merged set. */
function FieldExtensionStep(props: {
  slotId: string;
  contributions: ReturnType<
    FieldExtensionsDescriptor<unknown>["useContributions"]
  >;
  index: number;
  acc: FieldDef<unknown>[];
  storageKey: DataViewId;
  rowKey: (row: unknown, index: number) => string;
  emit: (fields: FieldDef<unknown>[]) => ReactNode;
}): ReactNode {
  const { slotId, contributions, index, acc, storageKey, rowKey, emit } = props;
  // Every contributor has mounted and folded its fields into `acc` → emit.
  if (index >= contributions.length) return <>{emit(acc)}</>;

  const contribution = contributions[index]!;
  // Thread the surface coordinates `{ storageKey, rowKey }` alongside `render`.
  // A contributor that doesn't need them (e.g. Sonata's play-count) ignores them.
  const renderProps: FieldExtensionProps<unknown> = {
    storageKey,
    rowKey,
    render: (fields) => (
      <FieldExtensionStep
        slotId={slotId}
        contributions={contributions}
        index={index + 1}
        acc={[...acc, ...fields]}
        storageKey={storageKey}
        rowKey={rowKey}
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
