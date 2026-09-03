import { useCallback, useState } from "react";
import {
  Button,
  DialogTitle,
  DialogDescription,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  EndpointError,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import type { ConfirmDialogOptions } from "../internal/confirm-dialog";

type Props = ConfirmDialogOptions & {
  onClose: () => void;
  onConfirmed: () => void;
};

/**
 * Body of confirmDialog. Owns the error policy, because Button cannot: Button
 * auto-pends off a returned thenable but attaches only `.finally()`, so a rejected
 * onClick promise would escape as an unhandled rejection. runConfirm therefore
 * ALWAYS resolves (try/catch, no rethrow into Button). On failure it keeps the
 * dialog open and renders the message inline (the confirm button re-enables, so the
 * message IS the retry). A non-EndpointError also re-files the crash via
 * `void Promise.reject(err)` (fetchEndpoint already reported EndpointError to the
 * endpointErrorSink, so that one is only shown, not re-filed).
 */
export function ConfirmDialogBody({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  children,
  onConfirm,
  onClose,
  onConfirmed,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runConfirm = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      await onConfirm();
      onConfirmed();
      onClose();
    } catch (err) {
      setError(getEndpointErrorMessage(err));
      setPending(false);
      if (!(err instanceof EndpointError)) void Promise.reject(err);
    }
  }, [onConfirm, onConfirmed, onClose]);

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </Stack>
      {children}
      {error && (
        <Text as="p" variant="body" tone="destructive" role="alert">
          {error}
        </Text>
      )}
      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant="destructive" onClick={runConfirm} loading={pending}>
          {confirmLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
