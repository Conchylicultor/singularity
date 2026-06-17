import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import {
  useEndpoint,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  listTweakcnThemes,
  importTweakcnTheme,
  deleteTweakcnTheme,
} from "@plugins/ui/plugins/tweakcn/core";

/** Extract a bare theme ID from a tweakcn URL or raw ID string. */
function parseThemeId(input: string): string {
  const trimmed = input.trim();
  // Match URLs like https://tweakcn.com/r/themes/<id>.json or .../themes/<id>
  const urlMatch = trimmed.match(/tweakcn\.com\/r\/themes\/([^/.]+)(?:\.json)?/);
  if (urlMatch) return urlMatch[1]!;
  // Strip trailing .json if present
  return trimmed.replace(/\.json$/, "");
}

type ThemePresets = Record<
  string,
  { light: Record<string, string>; dark: Record<string, string> }
>;

/**
 * Secondary "Import by URL" affordance nested inside the community browser.
 * The catalog grid is the primary discovery path; this collapsed disclosure is
 * the escape hatch for any tweakcn theme not in the bundled snapshot (brand-new,
 * unlisted, or private) — pulled live by ID/URL. Imported themes register as
 * presets (via the parent plugin's PresetSource) and are listed here for
 * apply/delete. Applying reuses the section's shared `onApply`.
 */
export function ImportByUrl({
  search,
  onApply,
}: {
  search: string;
  onApply: (tweakcnId: string, presets: ThemePresets) => void;
}) {
  const [input, setInput] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const { data: themes } = useEndpoint(listTweakcnThemes, {});

  const importMutation = useEndpointMutation(importTweakcnTheme, {
    invalidates: [listTweakcnThemes],
  });
  const deleteMutation = useEndpointMutation(deleteTweakcnTheme, {
    invalidates: [listTweakcnThemes],
  });

  const q = search.toLowerCase();
  const visible =
    q.length > 0
      ? (themes ?? []).filter((t) => t.label.toLowerCase().includes(q))
      : (themes ?? []);

  // Surface the panel automatically when the user searches for it or for one of
  // their saved imports, so search hits are never hidden behind a closed disclosure.
  const forceOpen =
    q.length > 0 && ("import by url".includes(q) || visible.length > 0);
  const open = userOpen || forceOpen;

  const handleImport = () => {
    const themeId = parseThemeId(input);
    if (!themeId) return;
    importMutation.mutate(
      { body: { themeId } },
      { onSuccess: () => setInput("") },
    );
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      className="rounded-lg border border-border/60"
    >
      <CollapsibleTrigger className="gap-xs px-md py-sm text-body text-muted-foreground hover:text-foreground">
        <CollapsibleChevron />
        <span className="font-medium">Import by URL</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="flex flex-col gap-md border-t border-border/60 px-md py-md">
        <div className="flex gap-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleImport();
            }}
            placeholder="Theme ID or tweakcn URL..."
            className="flex-1 rounded-md border border-border bg-muted/20 px-md py-xs text-body text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImport}
            loading={importMutation.isPending}
            disabled={!input.trim()}
            className="border border-border"
          >
            Import
          </Button>
        </div>

        {importMutation.isError && (
          <Text as="p" variant="body" tone="destructive">
            {importMutation.error.message}
          </Text>
        )}

        {visible.length > 0 ? (
          <div className="flex flex-col gap-sm">
            {visible.map((theme) => (
              <div
                key={theme.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-md py-sm"
              >
                <Text as="span" variant="label">
                  {theme.label}
                </Text>
                <div className="flex gap-xs">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onApply(theme.tweakcnId, theme.presets)}
                    className="text-primary hover:bg-primary/10"
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => deleteMutation.mutate({ params: { id: theme.id } })}
                    loading={deleteMutation.isPending}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Text as="p" variant="body" tone="muted">
            Paste a tweakcn theme ID or URL to import any theme — including ones
            not in the community catalog.
          </Text>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
