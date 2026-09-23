import type { ReactElement, ReactNode } from "react";
import type { MocksDeclaration } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CounterpartKindMeta } from "../types";

/** A notice, as the frame's unresolved arm renders it. */
export interface Notice {
  title: ReactNode;
  detail: ReactNode;
}

/**
 * Every registered kind, as the one line the author would write for it. The
 * list is the registry's own, so a new kind plugin shows up here with no edit.
 */
export function KindExamples({
  kinds,
}: {
  kinds: readonly CounterpartKindMeta[];
}): ReactElement {
  if (kinds.length === 0) {
    return (
      <Text variant="caption" tone="muted">
        No counterpart kind is contributed in this worktree.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {kinds.map((k) => (
        <Stack key={k.example} gap="2xs">
          <Text variant="caption" tone="muted">
            {k.label}
          </Text>
          <Text as="div" variant="code">
            {`<meta name="mocks" content="${k.example}" />`}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * This prototype names no counterpart — the ordinary case, since most
 * prototypes are not a mockup of anything in the app. So the copy is about how
 * to add one rather than about something being wrong.
 */
export function noDeclaration(kinds: readonly CounterpartKindMeta[]): Notice {
  return {
    title: "This prototype does not say what it is a mockup of.",
    detail: (
      <Stack gap="sm">
        <Text variant="body" tone="muted">
          Add one line to its <Badge mono>index.html</Badge>, naming the kind of
          counterpart and which one:
        </Text>
        <KindExamples kinds={kinds} />
        <Text variant="caption" tone="muted">
          Saving the file reloads this frame.
        </Text>
      </Stack>
    ),
  };
}

/**
 * The line is there but is not a `<kind>:<ref>` declaration. The card and the
 * pane's problem banner already list it; this is the same fact where the
 * author is looking for the comparison, with the syntax beside it.
 */
export function malformedDeclaration(
  decl: Extract<MocksDeclaration, { kind: "malformed" }>,
  kinds: readonly CounterpartKindMeta[],
): Notice {
  return {
    title: (
      <>
        This prototype&apos;s <Badge mono>mocks</Badge> line is not a
        declaration: {decl.reason}.
      </>
    ),
    detail: (
      <Stack gap="sm">
        <Text as="div" variant="code">
          {`<meta name="mocks" content="${decl.raw}" />`}
        </Text>
        <Text variant="body" tone="muted">
          Write it as <Badge mono>{"<kind>:<ref>"}</Badge>. The kinds this
          worktree knows:
        </Text>
        <KindExamples kinds={kinds} />
      </Stack>
    ),
  };
}
