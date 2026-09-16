import { useState, type FormEvent, type ReactElement } from "react";
import {
  Button,
  DialogDescription,
  DialogTitle,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  getEndpointErrorMessage,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { signIn } from "@plugins/auth/core";
import { toast } from "@plugins/shell/plugins/notifications/web";

/**
 * The sign-in dialog of any `kind: "password"` provider (opened through
 * `openDialog`, which owns the panel). Central trades the username + password
 * for the provider's token and keeps only the token.
 */
export function PasswordSignInDialog({
  providerId,
  providerName,
  usernameLabel = "Username",
  signUpUrl,
  close,
}: {
  providerId: string;
  providerName: string;
  usernameLabel?: string;
  signUpUrl?: string;
  close: () => void;
}): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // `suppressError` + an inline message: a rejection is the provider's own
  // verdict on these credentials ("There are no accounts with this username."),
  // so it belongs beside the fields, and the still-open dialog is the retry.
  const submit = useEndpointMutation(signIn, {
    meta: { suppressError: true },
    onSuccess: ({ identity }) => {
      const who = identity.email ?? identity.displayName;
      toast({
        type: "auth",
        title: "Signed in",
        description: who ? `${providerName} (${who})` : providerName,
        variant: "success",
      });
      close();
    },
  });

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !submit.isPending;

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!canSubmit) return;
    submit.mutate({
      params: { provider: providerId },
      body: { username: username.trim(), password },
    });
  }

  return (
    <Stack as="form" onSubmit={onSubmit} gap="md">
      <Stack gap="xs">
        <DialogTitle>Sign in to {providerName}</DialogTitle>
        <DialogDescription>
          Your password is sent to {providerName} once, to get a sign-in token.
          Only the token is stored.
        </DialogDescription>
      </Stack>

      <Stack as="label" gap="2xs">
        <Text variant="label">{usernameLabel}</Text>
        <Input
          name="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Stack>

      <Stack as="label" gap="2xs">
        <Text variant="label">Password</Text>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Stack>

      {submit.isError && (
        <Text as="p" variant="body" tone="destructive" role="alert">
          {getEndpointErrorMessage(submit.error)}
        </Text>
      )}

      {signUpUrl && (
        <Text as="p" variant="caption" tone="muted">
          No {providerName} account?{" "}
          <a
            className="underline"
            href={signUpUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Create an account
          </a>
        </Text>
      )}

      <Stack direction="row" align="center" gap="sm">
        <Fill />
        <Button
          variant="ghost"
          type="button"
          onClick={close}
          disabled={submit.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} loading={submit.isPending}>
          Sign in
        </Button>
      </Stack>
    </Stack>
  );
}
