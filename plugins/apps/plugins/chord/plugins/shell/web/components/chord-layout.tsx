import { FullPane } from "@plugins/layouts/plugins/full-pane/web";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { chordApp } from "../../core";
import { ChordLogo } from "./chord-logo";

/**
 * The Chord app's surface: a thin header with the logo and the app's name,
 * above the full-pane renderer. The shell registers no pane of its own — the
 * trainer registers the app's index pane, which fills the space below.
 */
export function ChordLayout() {
  return (
    <Column
      className="h-full"
      scrollBody={false}
      header={
        <Bar>
          <ChordLogo />
          <Text variant="label" className="font-bold">
            {chordApp.name}
          </Text>
        </Bar>
      }
      body={<FullPane />}
    />
  );
}
