import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useEffect, useCallback, useMemo } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { MdRefresh } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listMemoryFiles, readMemoryFile } from "../../shared/endpoints";

type MemoryFile = {
  name: string;
  type: "index" | "feedback" | "project" | "user" | "reference" | "other";
};

const TYPE_BADGE_CLASSES: Record<MemoryFile["type"], string> = {
  index: "bg-muted text-muted-foreground",
  feedback: "bg-warning/10 text-warning",
  project: "bg-info/10 text-info",
  user: "bg-success/10 text-success",
  reference: "bg-categorical-5/15 text-categorical-5",
  other: "bg-muted text-muted-foreground",
};

function displayName(name: string): string {
  return formatStatusLabel(name.replace(/\.md$/, ""));
}

export function MemoryPanel() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [dir, setDir] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await fetchEndpoint(listMemoryFiles, {});
      setFiles(data.files);
      setDir(data.dir);
      if (data.files.length > 0 && selected === null) {
        setSelected(data.files[0]?.name ?? null);
      }
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // non-fatal
    }
  }, [selected]);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    if (!selected) { setContent(null); return; }
    setLoadingContent(true);
    setError(null);
    fetchEndpoint(readMemoryFile, { name: selected })
      .then((data) => {
        setContent(data.content);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoadingContent(false));
  }, [selected]);

  const grouped = useMemo(() => {
    const order: MemoryFile["type"][] = ["index", "feedback", "project", "user", "reference", "other"];
    const groups = new Map<MemoryFile["type"], MemoryFile[]>();
    for (const f of files) {
      const g = groups.get(f.type) ?? [];
      g.push(f);
      groups.set(f.type, g);
    }
    return order.flatMap((type) => {
      const items = groups.get(type);
      return items ? [{ type, items }] : [];
    });
  }, [files]);

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="flex w-56 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <SectionLabel as="span" className="font-medium">
            Memory files
          </SectionLabel>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => void loadList()}
            title="Refresh"
          >
            <MdRefresh className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              {type !== "index" && (
                <div className="px-3 py-1 text-3xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {type}
                </div>
              )}
              {items.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setSelected(f.name)}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-caption transition-colors hover:bg-muted/50 flex items-center gap-1.5 min-w-0",
                    selected === f.name && "bg-muted font-medium",
                  )}
                >
                  <span className="truncate">{displayName(f.name)}</span>
                  {f.type !== "index" && f.type !== "other" && (
                    <Badge
                      size="sm"
                      colorClass={TYPE_BADGE_CLASSES[f.type]}
                      className="ml-auto shrink-0"
                    >
                      {formatStatusLabel(f.type)}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ))}
          {files.length === 0 && (
            <Text as="p" variant="caption" className="px-3 py-4 text-muted-foreground">No memory files found.</Text>
          )}
        </div>
        {dir && (
          <div className="border-t px-3 py-2">
            <p className="truncate font-mono text-3xs text-muted-foreground/50" title={dir}>{dir}</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <Text as="div" variant="body" className="flex h-full items-center justify-center text-muted-foreground">
            Select a memory file
          </Text>
        ) : loadingContent ? (
          <Loading className="flex h-full items-center justify-center" />
        ) : error ? (
          <Text as="div" variant="body" className="flex h-full items-center justify-center text-destructive">
            {error}
          </Text>
        ) : content !== null ? (
          <Text as="div" variant="body" className="px-6 py-4">
            <Markdown>{content}</Markdown>
          </Text>
        ) : null}
      </div>
    </div>
  );
}
