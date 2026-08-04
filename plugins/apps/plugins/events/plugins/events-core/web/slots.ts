import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FieldsRecord } from "@plugins/fields/core";

/** Icon component convention used across the platform (react-icons/md style). */
type IconType = ComponentType<{ className?: string }>;

/**
 * The source-type registry, web half (collection-consumer). The `+` menu and the
 * source detail pane read `EventSources.Type.useContributions()` and never name a
 * specific type — a new source type drops in with zero edits to the Events app.
 *
 * `configFields` is the SAME `FieldsRecord` the server validates a row's `config`
 * against, imported from the source type's `core/`. The form is rendered
 * generically from it, so a source type ships no form code at all; `Extra` is the
 * opt-in escape hatch for bespoke chrome (a "Connect" button), never the default.
 *
 * The namespace is `EventSources`, PLURAL: `EventSource` is a DOM global.
 *
 * Two independent one-way imports (sub-plugin web → here, sub-plugin server →
 * `events-core/server`), never web↔server inside the sub-plugin.
 */
export const EventSources = {
  Type: defineSlot<{
    id: string;
    label: string;
    icon?: IconType;
    configFields: FieldsRecord;
    Extra?: ComponentType<{ sourceId: string }>;
  }>("events.source-type", { docLabel: (p) => p.label }),
};
