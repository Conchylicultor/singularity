import { useState, useEffect, useCallback, useMemo } from "react";
import { MdRefresh } from "react-icons/md";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";

type MemoryFile = {
  name: string;
  type: "index" | "feedback" | "project" | "user" | "reference" | "other";
};

type ListResponse = { ok: true; files: MemoryFile[]; dir: string };
type ContentResponse = { ok: true; content: string } | { ok: false; error: string };

const TYPE_BADGE: Record<MemoryFile["type"], { label: string; classes: string }> = {
  index: { label: "index", classes: "bg-muted text-muted-foreground" },
  feedback: { label: "feedback", classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  project: { label: "project", classes: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  user: { label: "user", classes: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  reference: { label: "ref", classes: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  other: { label: "other", classes: "bg-muted text-muted-foreground" },
};

function displayName(name: string): string {
  return name.replace(/\.md$/, "").replace(/_/g, " ");
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
      const res = await fetch("/api/debug/memory");
      const data = (await res.json()) as ListResponse;
      if (data.ok) {
        setFiles(data.files);
        setDir(data.dir);
        if (data.files.length > 0 && selected === null) {
          setSelected(data.files[0]?.name ?? null);
        }
      }
    } catch {
      // non-fatal
    }
  }, [selected]);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    if (!selected) { setContent(null); return; }
    setLoadingContent(true);
    setError(null);
    fetch(`/api/debug/memory/${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((data: ContentResponse) => {
        if (data.ok) setContent(data.content);
        else setError(data.error);
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
    <div className="flex h-full overflow-hidden">
      {/* File list */}
      <div className="flex w-56 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Memory files
          </span>
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
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {type}
                </div>
              )}
              {items.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setSelected(f.name)}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 flex items-center gap-1.5 min-w-0",
                    selected === f.name && "bg-muted font-medium",
                  )}
                >
                  <span className="truncate">{displayName(f.name)}</span>
                  {f.type !== "index" && f.type !== "other" && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] font-medium",
                        TYPE_BADGE[f.type].classes,
                      )}
                    >
                      {TYPE_BADGE[f.type].label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {files.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No memory files found.</p>
          )}
        </div>
        {dir && (
          <div className="border-t px-3 py-2">
            <p className="truncate font-mono text-[9px] text-muted-foreground/50" title={dir}>{dir}</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a memory file
          </div>
        ) : loadingContent ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : content !== null ? (
          <div className="px-6 py-4 text-sm leading-6">
            <Markdown>{content}</Markdown>
          </div>
        ) : null}
      </div>
    </div>
  );
}
