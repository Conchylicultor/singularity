import { ControlSizeProvider, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useMemo } from "react";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { MdRefresh } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { getEndpointErrorMessage, useEndpoint } from "@plugins/infra/plugins/endpoints/web";
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
  // The user's explicit pick (null until they click a file). The effective
  // selection derives the first file as a default in render — no effect.
  const [picked, setPicked] = useState<string | null>(null);

  const listQuery = useEndpoint(listMemoryFiles, {});
  const files: MemoryFile[] = useMemo(() => listQuery.data?.files ?? [], [listQuery.data]);
  const dir = listQuery.data?.dir ?? "";
  const selected = picked ?? files[0]?.name ?? null;

  const contentQuery = useEndpoint(
    readMemoryFile,
    { name: selected ?? "" },
    { enabled: selected !== null },
  );
  const content = selected !== null ? (contentQuery.data?.content ?? null) : null;
  const loadingContent = selected !== null && contentQuery.isLoading;
  const error = contentQuery.error ? getEndpointErrorMessage(contentQuery.error) : null;

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
        <div className="flex items-center justify-between border-b px-md py-sm">
          <SectionLabel as="span" className="font-medium">
            Memory files
          </SectionLabel>
          <ControlSizeProvider size="xs">
            <IconButton
              icon={MdRefresh}
              label="Refresh"
              variant="ghost"
              onClick={() => void listQuery.refetch()}
            />
          </ControlSizeProvider>
        </div>
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
                  onClick={() => setPicked(f.name)}
                  className={cn(
                    "w-full px-md py-xs text-left text-caption transition-colors hover:bg-muted/50 flex items-center gap-xs min-w-0",
                    selected === f.name && "bg-muted font-medium",
                  )}
                >
                  <span className="truncate">{displayName(f.name)}</span>
                  {f.type !== "index" && f.type !== "other" && (
                    <Badge
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
