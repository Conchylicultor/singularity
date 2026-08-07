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
 * `originUrl` is the type's answer to "which web page does a configured source of
 * yours stand for?" — read generically by `useSourceOriginUrl` so a surface can
 * link an event back to where it came from without ever naming a source type. A
 * type that stands for no page (`manual`: the user IS the extractor) simply omits
 * it, which is why it is optional rather than a required `null`-returning stub.
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
    /**
     * The page one configured source of this type stands for, read off its stored
     * `config` blob — `null` when this particular row names none (or its blob no
     * longer fits the type's `configFields`). Omit the key entirely for a type
     * whose sources are not web pages at all.
     */
    originUrl?: (config: Record<string, unknown>) => string | null;
    Extra?: ComponentType<{ sourceId: string }>;
  }>("events.source-type", { docLabel: (p) => p.label }),
};
