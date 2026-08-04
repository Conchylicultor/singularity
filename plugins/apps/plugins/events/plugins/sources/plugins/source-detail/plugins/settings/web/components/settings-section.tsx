import type { ReactNode } from "react";
import { getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
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
 * Whether this source has anything to configure at all.
 *
 * `true` while the lookup is pending (loading is not empty — a `false` here
 * would pop the card in a frame late), `true` for an unregistered type (that
 * fact must be said out loud, not hidden), and otherwise only when the type
 * declares fields or bespoke chrome. A zero-config type therefore paints no
 * Settings card rather than a card reading "nothing to configure".
 */
export function useSourceSettingsAvailable({
  sourceId,
}: {
  sourceId: string;
}): boolean {
  const lookup = useEventSource(sourceId);
  const typeLookup = useEventSourceType(
    lookup.status === "found" ? lookup.source.type : "",
  );
  if (lookup.status !== "found") return lookup.status !== "missing";
  if (typeLookup.status === "unregistered") return true;
  return (
    Object.keys(typeLookup.type.configFields).length > 0 ||
    typeLookup.type.Extra !== undefined
  );
}

/**
 * The per-type configuration form, rendered GENERICALLY from the source type's
 * `configFields` — the same record the server validates the row against.
 *
 * There is no per-type branch in this file and there must never be one: a source
 * type ships a field record and gets a working form, which is what makes a
 * marketplace source type drop into this pane with zero edits here.
 *
 * Autosave is per field: each renderer owns its commit granularity (the text
 * renderer commits on blur, not per keystroke), so one PATCH lands per edit. The
 * PATCH sends the FULL config because `UpdateEventSourceBody.config` replaces
 * and revalidates the whole blob — a partial write cannot leave a row whose
 * config fails its type's schema.
 */
export function SourceSettingsSection({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const lookup = useEventSource(sourceId);
  const typeLookup = useEventSourceType(
    lookup.status === "found" ? lookup.source.type : "",
  );
  const update = useUpdateEventSource();

  if (lookup.status === "pending") return <Loading variant="rows" />;
  if (lookup.status === "error") {
    return <Placeholder tone="error">{lookup.error.message}</Placeholder>;
  }
  if (lookup.status === "missing") {
    return <Placeholder>This source no longer exists.</Placeholder>;
  }
  if (typeLookup.status === "unregistered") {
    return (
      <Placeholder tone="error">
        The source type &ldquo;{lookup.source.type}&rdquo; is not installed, so
        its settings cannot be shown or edited. Reinstall the plugin that
        provides it, or delete this source.
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
    <Stack gap="md">
      <SourceConfigForm
        fields={type.configFields}
        values={resolved.values}
        onChange={(key, value) => {
          update.mutate({
            params: { id: sourceId },
            body: { config: { ...resolved.values, [key]: value } },
          });
        }}
      />
      {update.error && (
        <Text as="p" variant="caption" tone="destructive">
          {getEndpointErrorMessage(update.error)}
        </Text>
      )}
      {Extra ? <Extra sourceId={sourceId} /> : null}
    </Stack>
  );
}
