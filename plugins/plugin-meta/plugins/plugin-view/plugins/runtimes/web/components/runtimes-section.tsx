import { cn } from "@/lib/utils";
import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";

export function RuntimesSection({ node }: { node: PluginNode }) {
  return (
    <Section title="Runtimes">
      <div className="flex flex-wrap gap-1.5">
        {node.runtimes.web && <RuntimePill kind="web" />}
        {node.runtimes.server && <RuntimePill kind="server" />}
        {node.runtimes.central && <RuntimePill kind="central" />}
      </div>
    </Section>
  );
}

function RuntimePill({ kind }: { kind: "web" | "server" | "central" }) {
  const styles = {
    web: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    server: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    central: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  } as const;
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        styles[kind],
      )}
    >
      {kind}
    </span>
  );
}
