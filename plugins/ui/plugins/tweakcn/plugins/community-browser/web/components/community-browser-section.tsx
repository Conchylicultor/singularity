import { useMemo, useState } from "react";
import {
  useEndpoint,
  useEndpointMutation,
  fetchEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { setConfigField } from "@plugins/config_v2/core";
import { ThemeEngine, useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { listTweakcnThemes } from "@plugins/ui/plugins/tweakcn/core";
import { getCatalog, applyCatalogTheme } from "../../core";
import { CommunityThemeCard } from "./community-theme-card";
import { ImportByUrl } from "./import-by-url";

export function CommunityBrowserSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const [activeTag, setActiveTag] = useState("all");
  const [themeQuery, setThemeQuery] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data, isLoading } = useEndpoint(getCatalog, {});
  const themes = data?.themes;

  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const registrations = useConfigRegistrations();

  const applyMutation = useEndpointMutation(applyCatalogTheme, {
    invalidates: [listTweakcnThemes],
  });

  const sortedTags = useMemo(() => {
    if (!themes) return [];
    const counts = new Map<string, number>();
    for (const t of themes) {
      for (const tag of t.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [themes]);

  const q = search.toLowerCase();
  const localQ = themeQuery.toLowerCase();
  const matchesQuery = (
    t: { name: string; tags: string[] },
    query: string,
  ) =>
    query.length === 0 ||
    t.name.toLowerCase().includes(query) ||
    t.tags.some((tag) => tag.toLowerCase().includes(query));

  const visible = useMemo(() => {
    if (!themes) return [];
    return themes.filter((t) => {
      if (activeTag !== "all" && !t.tags.includes(activeTag)) return false;
      if (!matchesQuery(t, q)) return false;
      if (!matchesQuery(t, localQ)) return false;
      return true;
    });
  }, [themes, activeTag, q, localQ]);

  const sectionMatchesSearch =
    search.length === 0 ||
    "community themes".includes(q) ||
    "community".includes(q) ||
    "import by url".includes(q) ||
    "tweakcn".includes(q);

  if (!sectionMatchesSearch && visible.length === 0) return null;

  const handleApply = (
    tweakcnId: string,
    presets: Record<
      string,
      { light: Record<string, string>; dark: Record<string, string> }
    >,
  ) => {
    const presetId = `tweakcn:${tweakcnId}`;
    for (const group of tokenGroups) {
      if (group.id in presets) {
        const reg = registrations.find(
          (r) => r.descriptor === group.configDescriptor,
        );
        if (reg) {
          void fetchEndpoint(setConfigField, {}, {
            body: scopeId
              ? { storePath: reg.storePath, key: "preset", value: presetId, scopeId }
              : { storePath: reg.storePath, key: "preset", value: presetId },
          });
        }
      }
    }
  };

  const handleCardClick = (themeId: string) => {
    setApplyingId(themeId);
    applyMutation.mutate(
      { body: { themeId } },
      {
        onSuccess: (savedTheme) => {
          handleApply(savedTheme.tweakcnId, savedTheme.presets);
          setApplyingId(null);
        },
        onError: () => setApplyingId(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {themes && themes.length > 0 && (
        <SearchInput
          placeholder="Search themes..."
          value={themeQuery}
          onChange={(e) => setThemeQuery(e.target.value)}
        />
      )}

      {sortedTags.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          <FilterChip
            active={activeTag === "all"}
            onClick={() => setActiveTag("all")}
          >
            All
          </FilterChip>
          {sortedTags.map((tag) => (
            <FilterChip
              key={tag}
              active={activeTag === tag}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </FilterChip>
          ))}
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading themes...</p>
      )}

      {!isLoading && themes && visible.length > 0 && (
        <>
          <span className="text-xs text-muted-foreground">
            {visible.length} themes
          </span>
          <div className="grid grid-cols-2 gap-2">
            {visible.map((theme) => (
              <CommunityThemeCard
                key={theme.id}
                theme={theme}
                isPending={applyingId === theme.id}
                onApply={() => handleCardClick(theme.id)}
              />
            ))}
          </div>
        </>
      )}

      {!isLoading && themes && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No themes match your search.
        </p>
      )}

      <ImportByUrl search={search} onApply={handleApply} />
    </div>
  );
}
