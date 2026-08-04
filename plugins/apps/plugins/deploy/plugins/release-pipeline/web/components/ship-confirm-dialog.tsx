import type { ReactNode } from "react";
import {
  Button,
  DialogDescription,
  DialogTitle,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  NEVER_REHEARSED_SENTENCE,
  REHEARSAL_LIMIT_NOTE,
} from "../../core";

/**
 * The confirm behind **Ship without rehearsing**.
 *
 * It exists because in P2 the honest answer to "did you test this?" is *no* —
 * nothing has rehearsed this bundle, and the binary itself has never executed on
 * this machine. The dialog states that instead of letting a one-click ship imply
 * otherwise. What DOES exercise the artifact is `ship`'s own remote health gate
 * and its revert, which is why they are named here.
 */
export function ShipConfirmDialog({
  composition,
  runId,
  onCancel,
  onConfirm,
}: {
  composition: string;
  runId: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): ReactNode {
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <DialogTitle>Ship {composition} without rehearsing it?</DialogTitle>
        <DialogDescription>{NEVER_REHEARSED_SENTENCE}</DialogDescription>
        <Text as="p" variant="body" tone="muted">
          {REHEARSAL_LIMIT_NOTE} The only thing that exercises this artifact is
          the remote health gate <code>ship</code> runs after activating it — and
          the revert it performs when that gate fails.
        </Text>
        <Text as="p" variant="body" tone="muted">
          Pinned run: <Text as="code" variant="body">{runId}</Text>
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Ship it
        </Button>
      </Stack>
    </Stack>
  );
}
