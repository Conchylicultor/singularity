import type { ReactNode } from "react";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { ControlPanelPane } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useUpdateEventSource } from "@plugins/apps/plugins/events/plugins/events-core/web";
import {
  SourceConfigForm,
  readConfigValues,
  useEventSource,
  useEventSourceType,
} from "@plugins/apps/plugins/events/plugins/sources/web";

/**
 * The row's own `name` column, as a field — deliberately NOT a member of any
 * source type's `configFields`, and declared here because every source has a
 * name whatever its type.
 *
 * It renders through the same `FieldRenderer` dispatch as the type's own fields,
 * so the card reads as one form even though the two halves land in different
 * parts of the PATCH (`name` is a column, `config` is a revalidated blob).
 *
 * Module-level and frozen: `textField` returns a frozen def, so re-creating it
 * per render would only churn the renderer's props.
 */
const nameField = textField({
  label: "Name",
  description:
    "What this source is called everywhere it appears. Clearing it restores the default name derived from its configuration.",
  placeholder: "e.g. Fitzroy gigs",
});

/**
 * The source's editable values, as ONE card: its name, then the per-type
 * configuration form rendered GENERICALLY from the source type's `configFields`
 * — the same record the server validates the row against.
 *
 * There is no per-type branch in this file and there must never be one: a source
 * type ships a field record and gets a working form, which is what makes a
 * marketplace source type drop into this pane with zero edits here. `name` does
 * not break that rule — it belongs to the row, not to any type.
 *
 * Name and config share one card on purpose. Two cards of text inputs stacked on
 * top of each other read as one form split in half for no reason the user can
 * see, and the split had a worse failure: this card is absent for a type with
 * nothing to configure, so a name field living in its own card would be the only
 * survivor, while a name field folded into a card that disappears would leave a
 * `manual` source unrenameable. The name renders BEFORE the type gates below, so
 * it stays editable even when the type is uninstalled or its stored config no
 * longer parses — the states in which naming the row is most useful.
 *
 * Autosave is per field: each renderer owns its commit granularity (the text
 * renderer commits on blur, not per keystroke), so one PATCH lands per edit. A
 * config PATCH sends the FULL config because `UpdateEventSourceBody.config`
 * replaces and revalidates the whole blob — a partial write cannot leave a row
 * whose config fails its type's schema.
 */
export function SourceSettingsSection({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const lookup = useEventSource(sourceId);
  const update = useUpdateEventSource();

  if (lookup.status === "pending") return <Loading variant="rows" />;
  if (lookup.status === "error") {
    return <Placeholder tone="error">{lookup.error.message}</Placeholder>;
  }
  if (lookup.status === "missing") {
    return <Placeholder>This source no longer exists.</Placeholder>;
  }

  return (
    <Stack gap="md">
      {/* Its own panel, beside the type's. A field renderer reads the host's
          presentation policy (push vs inline, description as prose vs tooltip),
          so it needs a panel around it — and `SourceConfigForm` below opens its
          own, which a second one here must not nest inside. Two panels stacked
          render as one form: same rail, same row height, same hairlines. */}
      <ControlPanelPane>
        <FieldRenderer
          field={nameField}
          value={lookup.source.name}
          onChange={(value) => {
            // The dispatch slot is value-erased (`FieldRendererProps<unknown>`),
            // but the renderer answering a `text` field emits its own `T` — a
            // string. The cast restates that, it does not assume it.
            update.mutate({
              params: { id: sourceId },
              body: { name: value as string },
            });
          }}
        />
      </ControlPanelPane>
      <SourceTypeConfig sourceId={sourceId} type={lookup.source.type} />
      {update.error && (
        <Text as="p" variant="caption" tone="destructive">
          {getEndpointErrorMessage(update.error)}
        </Text>
      )}
    </Stack>
  );
}

/**
 * The type-owned half of the card: the generic config form, or the one honest
 * sentence explaining why there is no form to draw.
 *
 * Split out so the `name` field above it renders unconditionally — the three
 * arms here are all reasons the CONFIG cannot be shown, never reasons the row
 * cannot be named.
 */
function SourceTypeConfig({
  sourceId,
  type: typeId,
}: {
  sourceId: string;
  type: string;
}): ReactNode {
  const typeLookup = useEventSourceType(typeId);
  const lookup = useEventSource(sourceId);
  const update = useUpdateEventSource();

  if (lookup.status !== "found") return null;
  if (typeLookup.status === "unregistered") {
    return (
      <Placeholder tone="error">
        The source type &ldquo;{typeId}&rdquo; is not installed, so its settings
        cannot be shown or edited. Reinstall the plugin that provides it, or
        delete this source.
      </Placeholder>
    );
  }

  const type = typeLookup.type;
  const resolved = readConfigValues(type.configFields, lookup.source.config);
  if (resolved.status === "invalid") {
    return (
      <Placeholder tone="error">
        This source&apos;s stored configuration no longer matches the{" "}
        {type.label} schema: {resolved.message}
      </Placeholder>
    );
  }

  const Extra = type.Extra;

  return (
    <>
      <SourceConfigForm
        fields={type.configFields}
        values={resolved.values}
        // Reworded for its new neighbour: with the Name field above it, the card
        // is no longer empty, so this says what the TYPE has — not what the card
        // has.
        emptyLabel="This source type has nothing of its own to configure."
        onChange={(key, value) => {
          update.mutate({
            params: { id: sourceId },
            body: { config: { ...resolved.values, [key]: value } },
          });
        }}
      />
      {Extra ? <Extra sourceId={sourceId} /> : null}
    </>
  );
}
