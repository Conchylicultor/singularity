import type { ReactElement } from "react";
import {
  Button,
  DialogTitle,
  DialogDescription,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";

/**
 * Confirm body for "Reset to first-launch". The imperative-dialog host provides
 * the `Dialog` + `DialogContent` shell; this render owns its own chrome + the
 * a11y `DialogTitle`. Copy explicitly states main is untouched, so a served
 * composition's reset can never be mistaken for a main-data wipe.
 *
 * `onConfirm` returns the mutation promise, so the destructive Button auto-enters
 * its pending state (spinner + disabled) until the reset settles — the caller
 * closes the dialog on success.
 */
export function ConfirmResetDialog({
  host,
  onCancel,
  onConfirm,
}: {
  host: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): ReactElement {
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <DialogTitle>Reset {host} to first-launch?</DialogTitle>
        <DialogDescription>
          This wipes this composition&apos;s database and config so you see
          exactly what a new user gets. The main app&apos;s data (the{" "}
          <code>singularity</code> database and its config) is not touched.
        </DialogDescription>
      </Stack>
      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Reset to first-launch
        </Button>
      </Stack>
    </Stack>
  );
}
