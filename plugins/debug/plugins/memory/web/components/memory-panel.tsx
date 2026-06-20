import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, useEffect, useCallback, useMemo } from "react";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { MdRefresh } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
    <Stack direction="row" gap="none" className="h-full">
      {/* File list */}
      {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid fixed-width sidebar column in the two-pane row; must not shrink under the flexible content pane */}
      <Stack gap="none" className="w-56 shrink-0 border-r">
        <Frame
          className="border-b px-md py-sm"
          content={
            <SectionLabel as="span" className="font-medium">
              Memory files
            </SectionLabel>
          }
          trailing={
            <Button
              variant="ghost"
              aspect="icon"
              className="size-6"
              onClick={() => loadList()}
              title="Refresh"
            >
              <MdRefresh className="size-4" />
            </Button>
          }
        />
        <Scroll fill className="py-xs">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              {type !== "index" && (
                <div className="px-md py-xs text-3xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {type}
                </div>
              )}
              {items.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setSelected(f.name)}
                  className={cn(
                    "w-full px-md py-xs text-left text-caption transition-colors hover:bg-muted/50",
                    selected === f.name && "bg-muted font-medium",
                  )}
                >
                  <Frame
                    gap="xs"
                    content={<span className="truncate">{displayName(f.name)}</span>}
                    trailing={
                      f.type !== "index" && f.type !== "other" ? (
                        <Badge
                          colorClass={TYPE_BADGE_CLASSES[f.type]}
                        >
                          {formatStatusLabel(f.type)}
                        </Badge>
                      ) : undefined
                    }
                  />
                </button>
              ))}
            </div>
          ))}
          {files.length === 0 && (
            <Text as="p" variant="caption" className="px-md py-lg text-muted-foreground">No memory files found.</Text>
          )}
        </Scroll>
        {dir && (
          <div className="border-t px-md py-sm">
            <p className="truncate font-mono text-3xs text-muted-foreground/50" title={dir}>{dir}</p>
          </div>
        )}
      </Stack>

      {/* Content */}
      <Scroll fill>
        {!selected ? (
          <Center className="h-full">
            <Text as="div" variant="body" className="text-muted-foreground">
              Select a memory file
            </Text>
          </Center>
        ) : loadingContent ? (
          <Center className="h-full">
            <Loading />
          </Center>
        ) : error ? (
          <Center className="h-full">
            <Text as="div" variant="body" className="text-destructive">
              {error}
            </Text>
          </Center>
        ) : content !== null ? (
          <Text as="div" variant="body" className="px-xl py-lg">
            <Markdown>{content}</Markdown>
          </Text>
        ) : null}
      </Scroll>
    </Stack>
  );
}
