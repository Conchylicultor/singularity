import { Auth } from "../slots";
import { useAuthState } from "../hooks";
import { DefaultProviderRow } from "./default-provider-row";

export function AccountsPane() {
  const { data, error } = useAuthState();
  const providers = Auth.Provider.useContributions();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connect third-party services. Tokens are stored encrypted in
            <code className="mx-1">~/.singularity/auth/</code>
            on the main app and shared with all worktrees.
          </p>
        </div>
      </div>

      {data.mainOffline ? (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700">
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
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load auth state: {String(error)}
        </div>
      ) : null}

      <div className="flex flex-col divide-y rounded border">
        {providers.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No providers registered. Install an auth provider plugin (e.g.
            <code className="mx-1">auth-google</code>).
          </div>
        ) : (
          providers.map((p) => {
            const Row = p.rowComponent ?? DefaultProviderRow;
            return <Row key={p.id} providerId={p.id} />;
          })
        )}
      </div>
    </div>
  );
}
