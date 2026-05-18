import { useEffect, useState } from "react";
import type { PluginChangesResponse } from "../../core/protocol";
import { PluginChangeCard } from "./plugin-change-card";

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginChangesResponse }
  | { kind: "error"; message: string };

export function PluginChangesSection({
  conversationId,
}: {
  conversationId: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    fetch(
      `/api/review/plugin-changes?conversationId=${encodeURIComponent(conversationId)}`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({ kind: "error", message: text || res.statusText });
          return;
        }
        const data = (await res.json()) as PluginChangesResponse;
        setState({ kind: "ok", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (state.kind === "loading") {
    return (
      <p className="text-sm text-muted-foreground px-1">Loading plugins...</p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="text-sm text-red-400 px-1">Error: {state.message}</p>
    );
  }
  if (state.data.plugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-1">
        No plugin API changes detected.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {state.data.plugins.map((plugin) => (
        <PluginChangeCard
          key={plugin.path}
          conversationId={conversationId}
          plugin={plugin}
        />
      ))}
    </div>
  );
}
