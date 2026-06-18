import { useMemo, useState } from "react";
import {
  useEndpoint,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { setConfigField } from "@plugins/config_v2/core";
import { ThemeEngine, useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { listTweakcnThemes } from "@plugins/ui/plugins/tweakcn/core";
import type { CatalogTheme } from "../../shared";
import { getCatalog, applyCatalogTheme } from "../../core";
import { CommunityThemeCard } from "./community-theme-card";
import { ImportByUrl } from "./import-by-url";

const COMMUNITY_BROWSER_VIEW = defineDataView("tweakcn.community-browser");

export function CommunityBrowserSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const { data, isLoading } = useEndpoint(getCatalog, {});
  const themes = data?.themes;

  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const registrations = useConfigRegistrations();

  const applyMutation = useEndpointMutation(applyCatalogTheme, {
    invalidates: [listTweakcnThemes],
  });
  const { mutate: setConfigMutation } = useEndpointMutation(setConfigField);

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

  const tagOptions = useMemo(
    () => sortedTags.map((t) => ({ value: t, label: t })),
    [sortedTags],
  );

  const fields = useMemo<FieldDef<CatalogTheme>[]>(
    () => [
      { id: "name", label: "Name", type: "text", primary: true, value: (t) => t.name },
      {
        id: "tags",
        label: "Tags",
        type: "tags",
        values: (t) => t.tags,
        options: tagOptions,
        sortable: false,
      },
    ],
    [tagOptions],
  );

  const q = search.toLowerCase();
  const hostFilteredThemes = useMemo(() => {
    if (!themes) return [];
    if (q.length === 0) return themes;
    return themes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [themes, q]);

  const sectionMatchesSearch =
    search.length === 0 ||
    "community themes".includes(q) ||
    "community".includes(q) ||
    "import by url".includes(q) ||
    "tweakcn".includes(q);

  if (!sectionMatchesSearch) return null;

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
          setConfigMutation({
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
    <div className="flex flex-col gap-md">
      <DataView<CatalogTheme>
        mode="embedded"
        storageKey={COMMUNITY_BROWSER_VIEW}
        rows={hostFilteredThemes}
        fields={fields}
        rowKey={(t) => t.id}
        views={["gallery"]}
        defaultView="gallery"
        loading={isLoading}
        searchAccessor={(t) => `${t.name} ${t.tags.join(" ")}`}
        emptyState={
          <Text as="p" variant="body" tone="muted">
            No themes match your search.
          </Text>
        }
        viewOptions={{
          gallery: {
            minCardWidth: 220,
            renderCard: (t: CatalogTheme) => (
              <CommunityThemeCard
                theme={t}
                isPending={applyingId === t.id}
                onApply={() => handleCardClick(t.id)}
              />
            ),
          },
        }}
      />

      <ImportByUrl search={search} onApply={handleApply} />
    </div>
  );
}
