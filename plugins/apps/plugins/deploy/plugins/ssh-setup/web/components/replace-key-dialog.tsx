import type { ReactElement } from "react";
import {
  Button,
  DialogTitle,
  DialogDescription,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Confirm body for replacing a server's SSH key. The imperative-dialog host
 * provides the `Dialog` + `DialogContent` shell; this render owns its own
 * chrome + the a11y `DialogTitle`.
 *
 * The copy states all three consequences, because each is separately
 * surprising: the old private key is gone, the server is unreachable until the
 * new key is installed, and nothing on the server changes on its own.
 *
 * `onConfirm` returns the mutation promise, so the destructive Button
 * auto-enters its pending state (spinner + disabled) until the replace settles
 * — the caller closes the dialog on success.
 */
export function ReplaceKeyDialog({
  fingerprint,
  onCancel,
  onConfirm,
}: {
  fingerprint: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): ReactElement {
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <DialogTitle>Replace this server&apos;s SSH key?</DialogTitle>
        <DialogDescription>
          The stored private key for <code>{fingerprint}</code> is destroyed
          permanently — it cannot be recovered.
        </DialogDescription>
        <Text as="p" variant="body" tone="muted">
          Until you run the new install command on the server, this app cannot
          reach it. Nothing on the server changes on its own: the old key stays
          authorized until then, and the new install command removes it for you.
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Replace key
        </Button>
      </Stack>
    </Stack>
  );
}
