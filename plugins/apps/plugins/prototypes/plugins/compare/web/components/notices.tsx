import type { ReactElement } from "react";
import type { MocksDeclaration } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { CounterpartKindMeta } from "../types";

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
export function NoDeclaration({
  kinds,
}: {
  kinds: readonly CounterpartKindMeta[];
}): ReactElement {
  return (
    <Inset pad="lg">
      <Stack gap="sm">
        <Text variant="body">
          This prototype does not say what it is a mockup of.
        </Text>
        <Text variant="body" tone="muted">
          Add one line to its <Badge mono>index.html</Badge>, naming the kind of
          counterpart and which one:
        </Text>
        <KindExamples kinds={kinds} />
        <Text variant="caption" tone="muted">
          Saving the file reloads this pane.
        </Text>
      </Stack>
    </Inset>
  );
}

/**
 * The line is there but is not a `<kind>:<ref>` declaration. The card and the
 * Focus banner already list it as a problem; this is the same fact where the
 * author is looking for the comparison, with the syntax beside it.
 */
export function MalformedDeclaration({
  decl,
  kinds,
}: {
  decl: Extract<MocksDeclaration, { kind: "malformed" }>;
  kinds: readonly CounterpartKindMeta[];
}): ReactElement {
  return (
    <Inset pad="lg">
      <Stack gap="sm">
        <Text variant="body">
          This prototype's <Badge mono>mocks</Badge> line is not a declaration:{" "}
          {decl.reason}.
        </Text>
        <Text as="div" variant="code">
          {`<meta name="mocks" content="${decl.raw}" />`}
        </Text>
        <Text variant="body" tone="muted">
          Write it as <Badge mono>{"<kind>:<ref>"}</Badge>. The kinds this
          worktree knows:
        </Text>
        <KindExamples kinds={kinds} />
      </Stack>
    </Inset>
  );
}
