import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Auth } from "../slots";
import { useAuthState } from "../hooks";
import { DefaultProviderRow } from "./default-provider-row";

export function AccountsPane() {
  const authState = useAuthState();
  const providers = Auth.Provider.useContributions();

  return (
    <Stack gap="lg" className="p-xl">
      <Stack direction="row" align="center" justify="between" gap="none">
        <div>
          <Text as="h1" variant="heading">Accounts</Text>
          <Text as="p" variant="body" className="text-muted-foreground">
            Connect third-party services. Tokens are stored encrypted in
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline-code chip needs horizontal breathing room in flowing prose */}
            <code className="mx-1">~/.singularity/auth/</code>
            on the main app and shared with all worktrees.
          </Text>
        </div>
      </Stack>

      {!authState.pending && authState.data.mainOffline ? (
        <Text as="div" variant="body" className="rounded-md border border-warning/50 bg-warning/10 p-md text-warning">
          The main app is offline. Worktrees can't read tokens until it comes
          back. Visit{" "}
          <a
            className="underline"
            href="http://singularity.localhost:9000"
            target="_blank"
            rel="noreferrer"
          >
            http://singularity.localhost:9000
          </a>{" "}
          to start it.
        </Text>
      ) : null}

      {authState.pending && authState.error ? (
        <Text as="div" variant="body" className="rounded-md border border-destructive/50 bg-destructive/10 p-md text-destructive">
          Failed to load auth state: {String(authState.error)}
        </Text>
      ) : null}

      <Stack gap="none" className="divide-y rounded-md border">
        {providers.length === 0 ? (
          <Text as="div" variant="body" className="p-lg text-muted-foreground">
            No providers registered. Install an auth provider plugin (e.g.
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline-code chip needs horizontal breathing room in flowing prose */}
            <code className="mx-1">auth-google</code>).
          </Text>
        ) : (
          providers.map((p) => {
            const Row = p.rowComponent ?? DefaultProviderRow;
            return <Row key={p.id} providerId={p.id} />;
          })
        )}
      </Stack>
    </Stack>
  );
}
