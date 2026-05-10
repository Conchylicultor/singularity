import { useMemo } from "react";
import { MdBolt } from "react-icons/md";
import { Breadcrumb } from "@plugins/primitives/plugins/breadcrumb/web";
import type { PluginNode } from "../../shared/types";
import { PluginView } from "../slots";

interface PluginDetailProps {
  node: PluginNode | null;
}

export function PluginDetail({ node }: PluginDetailProps) {
  const sections = PluginView.Section.useContributions();
  const ordered = useMemo(
    () => [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sections],
  );

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight">
            <Breadcrumb
              segments={trail.map((seg, i) => ({
                key: String(i),
                label: seg,
              }))}
              actions={
                node.loadBearing ? (
                  <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    <MdBolt className="size-3" />
                    Load-bearing
                  </span>
                ) : undefined
              }
            />
          </div>
          {node.description && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {node.description}
            </p>
          )}
        </header>

        {ordered.map((s) => (
          <s.component key={s.id} node={node} />
        ))}
      </div>
    </div>
  );
}
