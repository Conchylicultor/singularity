import { useCallback } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { useTextFilter } from "@plugins/primitives/plugins/search/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { configDetailPane } from "../internal/panes";
import { ConfigNavRow } from "./config-nav-row";

export function ConfigNav() {
  const registrations = useConfigRegistrations();
  const openPane = useOpenPane();

  const accessor = useCallback(
    (r: ConfigRegistration) =>
      `${r.pluginName} ${Object.values(r.descriptor.fields)
        .map((f) => f.meta.label ?? "")
        .join(" ")}`,
    [],
  );

  const { query, setQuery, filtered } = useTextFilter({
    items: registrations,
    accessor,
  });

  const selectedPath = configDetailPane.useChainEntry()?.params.configPath;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter configs..." />
      <div className="flex-1 overflow-y-auto">
        {filtered.map((reg) => (
          <ConfigNavRow
            key={reg.storePath}
            registration={reg}
            selected={selectedPath === encodeURIComponent(reg.storePath)}
            onClick={() =>
              openPane(
                configDetailPane,
                { configPath: encodeURIComponent(reg.storePath) },
                { mode: "push" },
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
