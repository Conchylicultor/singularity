import { type ReactElement } from "react";
import { MdEvent } from "react-icons/md";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Events' index surface (bare `/events`) — the empty state shown before the user
 * opens one of the sidebar surfaces.
 *
 * The call to action is deliberately *prose* pointing at the sidebar rather than
 * a button linking to a hard-coded route: the shell must not name the `sources`
 * plugin (that import direction is `sources → shell`, and the sources route is
 * that plugin's to own). Once a real events list exists it becomes the natural
 * landing here — this stays the zero-sources state.
 */
export function EventsRoot(): ReactElement {
  return (
    <Center axis="both" className="min-h-full">
      <Stack gap="md" align="center" className="max-w-sm text-center">
        <MdEvent className="size-8 text-muted-foreground" />
        <Text as="h1" variant="heading">
          Events
        </Text>
        <Text as="p" variant="body" tone="muted">
          One database of what is happening — concerts, parties, meetups — fed by
          pluggable sources.
        </Text>
        <Text as="p" variant="body" tone="muted">
          Add your first source from Sources in the sidebar to start collecting
          events.
        </Text>
      </Stack>
    </Center>
  );
}
