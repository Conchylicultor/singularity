import { useState } from "react";
import {
  useEndpoint,
  useEndpointMutation,
  fetchEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import { Button } from "@/components/ui/button";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { setConfigField } from "@plugins/config_v2/core";
import { ThemeEngine, useThemeScopeId } from "@plugins/ui/plugins/theme-engine/web";
import {
  listTweakcnThemes,
  importTweakcnTheme,
  deleteTweakcnTheme,
} from "../../core";

/** Extract a bare theme ID from a tweakcn URL or raw ID string. */
function parseThemeId(input: string): string {
  const trimmed = input.trim();
  // Match URLs like https://tweakcn.com/r/themes/<id>.json or .../themes/<id>
  const urlMatch = trimmed.match(
    /tweakcn\.com\/r\/themes\/([^/.]+)(?:\.json)?/,
  );
  if (urlMatch) return urlMatch[1]!;
  // Strip trailing .json if present
  return trimmed.replace(/\.json$/, "");
}

export function TweakcnSection({ search }: { search: string }) {
  const scopeId = useThemeScopeId();
  const [input, setInput] = useState("");
  const { data: themes, isLoading } = useEndpoint(listTweakcnThemes, {});
  const tokenGroups = ThemeEngine.TokenGroup.useContributions();
  const registrations = useConfigRegistrations();

  const importMutation = useEndpointMutation(importTweakcnTheme, {
    invalidates: [listTweakcnThemes],
  });
  const deleteMutation = useEndpointMutation(deleteTweakcnTheme, {
    invalidates: [listTweakcnThemes],
  });

  // Filter by search
  const visible =
    search.length > 0
      ? (themes ?? []).filter((t) =>
          t.label.toLowerCase().includes(search.toLowerCase()),
        )
      : (themes ?? []);

  const sectionMatchesSearch =
    search.length === 0 ||
    "import from tweakcn".includes(search.toLowerCase()) ||
    "tweakcn".includes(search.toLowerCase());

  if (!sectionMatchesSearch && visible.length === 0) return null;

  const handleImport = () => {
    const themeId = parseThemeId(input);
    if (!themeId) return;
    importMutation.mutate(
      { body: { themeId } },
      { onSuccess: () => setInput("") },
    );
  };

  const handleApply = (tweakcnId: string, presets: Record<string, { light: Record<string, string>; dark: Record<string, string> }>) => {
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

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ params: { id } });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Import form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleImport();
          }}
          placeholder="Theme ID or tweakcn URL..."
          className="flex-1 rounded-md border border-border bg-muted/20 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleImport}
          disabled={!input.trim() || importMutation.isPending}
          className="border border-border"
        >
          {importMutation.isPending ? "Importing..." : "Import"}
        </Button>
      </div>

      {importMutation.isError && (
        <p className="text-sm text-destructive">
          {importMutation.error.message}
        </p>
      )}

      {/* Imported themes list */}
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading themes...</p>
      )}

      {visible.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map((theme) => (
            <div
              key={theme.id}
              className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
            >
              <span className="text-sm font-medium">{theme.label}</span>
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleApply(theme.tweakcnId, theme.presets)}
                  className="text-primary hover:bg-primary/10"
                >
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDelete(theme.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && themes && themes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No imported themes yet. Paste a tweakcn theme ID or URL above to
          import.
        </p>
      )}
    </div>
  );
}
