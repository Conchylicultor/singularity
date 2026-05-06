import { MdBolt } from "react-icons/md";
import { cn } from "@/lib/utils";
import type { PluginNode } from "../../shared/types";

interface PluginDetailProps {
  node: PluginNode | null;
}

export function PluginDetail({ node }: PluginDetailProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-center">
        <div className="max-w-sm text-sm text-muted-foreground">
          Select a plugin to inspect what would be included in its release.
        </div>
      </div>
    );
  }

  const trail = node.hierarchyId.split(".");
  const directChildren = node.children;
  const totalDescendants = countDescendants(node);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-8">
        <header className="flex flex-col gap-3">
          {trail.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {trail.slice(0, -1).map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span>{seg}</span>
                  <span className="text-muted-foreground/40">/</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {node.name}
            </h1>
            {node.loadBearing && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <MdBolt className="size-3" />
                Load-bearing
              </span>
            )}
          </div>
          {node.description && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {node.description}
            </p>
          )}
        </header>

        <Section title="Runtimes">
          <div className="flex flex-wrap gap-1.5">
            {node.runtimes.web && <RuntimePill kind="web" />}
            {node.runtimes.server && <RuntimePill kind="server" />}
            {node.runtimes.central && <RuntimePill kind="central" />}
          </div>
        </Section>

        {directChildren.length > 0 && (
          <Section
            title="Sub-plugins"
            count={
              totalDescendants > directChildren.length
                ? `${directChildren.length} direct · ${totalDescendants} total`
                : `${directChildren.length}`
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {directChildren.map((c) => (
                <span
                  key={c.hierarchyId}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground"
                >
                  {c.name}
                  {c.loadBearing && (
                    <MdBolt className="size-3 text-amber-500/90" />
                  )}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Source path">
          <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            plugins/{node.path}
          </code>
        </Section>
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: string;
  children: React.ReactNode;
}

function Section({ title, count, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h2>
        {count && (
          <span className="text-[11px] text-muted-foreground/60">{count}</span>
        )}
      </div>
      {children}
    </section>
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

function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const c of node.children) count += 1 + countDescendants(c);
  return count;
}
