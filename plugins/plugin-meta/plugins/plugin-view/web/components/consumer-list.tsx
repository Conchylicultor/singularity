import { useState } from "react";
import { asPath, type PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { PluginLink } from "./plugin-link";

/**
 * Trailing, right-aligned list of plugins that consume a symbol/slot/etc.
 * Renders the first `threshold` as links, collapsing the rest behind a
 * `+N` button. Shared across per-facet render-detail sections.
 */
export function ConsumerList({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 2;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <Cluster
      as="span"
      gap="xs"
      className="ml-auto text-3xs text-muted-foreground/60"
    >
      <span>←</span>
      {visible.map((name, i) => (
        <span key={name}>
          <PluginLink name={name} label={asPath(name as PluginId)} />
          {i < visible.length - 1 && ","}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          className="hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          +{remaining}
        </button>
      )}
    </Cluster>
  );
}
