import { useCallback, useState, useMemo } from "react";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SearchInput, useTextFilter } from "@plugins/primitives/plugins/search/web";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type { ConfigRegistration } from "@plugins/config_v2/web";
import { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { configDetailPane } from "../internal/panes";
import { buildConfigTree } from "../internal/build-config-tree";
import type { ConfigTreeGroup } from "../internal/build-config-tree";
import { ConfigNavRow } from "./config-nav-row";

function ConfigNavGroup({
  group,
  depth,
  expanded,
  onToggle,
  selectedPath,
  onSelect,
  showModifiedOnly,
}: {
  group: ConfigTreeGroup;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string, open: boolean) => void;
  selectedPath: string | undefined;
  onSelect: (reg: ConfigRegistration) => void;
  showModifiedOnly: boolean;
}) {
  const isOpen = expanded.has(group.id);

  return (
    <Collapsible open={isOpen} onOpenChange={(open) => onToggle(group.id, open)}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <CollapsibleChevron className="size-3" />
        <span className="truncate">{group.label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {group.children.map((child) => (
          <ConfigNavGroup
            key={child.id}
            group={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selectedPath={selectedPath}
            onSelect={onSelect}
            showModifiedOnly={showModifiedOnly}
          />
        ))}
        {group.registrations.map((reg) => (
          <ConfigNavRow
            key={reg.storePath}
            registration={reg}
            selected={selectedPath === encodeURIComponent(reg.storePath)}
            onClick={() => onSelect(reg)}
            hideIfUnmodified={showModifiedOnly}
            depth={depth + 1}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function collectGroupIds(groups: ConfigTreeGroup[]): string[] {
  const ids: string[] = [];
  for (const g of groups) {
    ids.push(g.id);
    ids.push(...collectGroupIds(g.children));
  }
  return ids;
}

export function ConfigNav() {
  const registrations = useConfigRegistrations();
  const openPane = useOpenPane();
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);

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

  const tree = useMemo(() => buildConfigTree(registrations), [registrations]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectGroupIds(tree)),
  );

  const handleToggle = useCallback((id: string, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectedPath = configDetailPane.useChainEntry()?.params.configPath;

  const handleSelect = useCallback(
    (reg: ConfigRegistration) => {
      openPane(
        configDetailPane,
        { configPath: encodeURIComponent(reg.storePath) },
        { mode: "push" },
      );
    },
    [openPane],
  );

  const useFlat = query.length > 0 || showModifiedOnly;

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter configs..."
          className="flex-1"
        />
        <FilterChip active={showModifiedOnly} onClick={() => setShowModifiedOnly((v) => !v)}>
          Modified
        </FilterChip>
      </div>
      <div className="flex-1 overflow-y-auto">
        {useFlat ? (
          filtered.map((reg) => (
            <ConfigNavRow
              key={reg.storePath}
              registration={reg}
              selected={selectedPath === encodeURIComponent(reg.storePath)}
              onClick={() => handleSelect(reg)}
              hideIfUnmodified={showModifiedOnly}
            />
          ))
        ) : (
          tree.map((group) => (
            <ConfigNavGroup
              key={group.id}
              group={group}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              showModifiedOnly={showModifiedOnly}
            />
          ))
        )}
      </div>
    </div>
  );
}
