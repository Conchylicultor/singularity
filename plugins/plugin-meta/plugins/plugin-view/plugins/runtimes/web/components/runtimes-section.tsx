import { cn } from "@/lib/utils";
import {
  Section,
  RUNTIME_COLORS,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";

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
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        RUNTIME_COLORS[kind],
      )}
    >
      {kind}
    </span>
  );
}
