import type { ReactNode } from "react";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEventSourceRun } from "@plugins/apps/plugins/events/plugins/events-core/web";

/**
 * The section is available even while the run is still loading: loading is not
 * emptiness, and a section that gated itself on data would flicker its whole
 * card in after the read (the `source-detail` house rule).
 */
export function useCaveatsAvailable(): boolean {
  return true;
}

export function CaveatsSection({ runId }: { runId: string }): ReactNode {
  const row = useEventSourceRun(runId);

  // Loading is its own arm. Rendering the empty copy here would state "no
  // limitations" about a run whose flags have simply not arrived — a confident
  // wrong answer, and the one the reader is least equipped to doubt.
  if (row.status === "loading") return <Loading variant="rows" />;
  if (row.status === "error") {
    return <Placeholder tone="error">{row.error.message}</Placeholder>;
  }
  // Absent: the pane's own resolve turns this into its Not Found; the section
  // has nothing of its own to say about a run that does not exist.
  if (!row.found) return null;

  const flags = row.row.flags;

  if (flags.length === 0) {
    return (
      <Placeholder>
        This extraction reported no limitations — every schedule on the page fit
        the event date format. That is the expected outcome, not a gap: caveats
        appear here only when the model met something it could not express.
      </Placeholder>
    );
  }

  return (
    // A flow container, so each caveat — free model prose, and occasionally a
    // paragraph of it — wraps inside the pane instead of forcing it wide.
    <Stack gap="sm">
      {flags.map((flag, index) => (
        // Keyed by position: the flags are free text with no id, and two runs
        // legitimately reporting the same sentence must not collide.
        <Surface key={`${index}:${flag}`} level="sunken">
          <Inset pad="sm">
            <Text as="p" variant="caption" className="break-words">
              {flag}
            </Text>
          </Inset>
        </Surface>
      ))}
    </Stack>
  );
}
