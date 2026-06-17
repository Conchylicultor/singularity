import { useState } from "react";
import { MdOpenInNew, MdSmartDisplay } from "react-icons/md";
import { cn, Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { embedBlock, toEmbedUrl } from "../../core";

export function EmbedBlock({ block, editor }: BlockRendererProps) {
  const { url } = embedBlock.parse(block.data);

  if (!url) {
    return <EmptyEmbedBlock onArm={() => editor.onFocus()} onSubmit={(u) => editor.update({ url: u })} />;
  }

  return <FilledEmbedBlock url={url} onReplace={() => editor.update({})} />;
}

function EmptyEmbedBlock({
  onArm,
  onSubmit,
}: {
  onArm: () => void;
  onSubmit: (url: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="px-md py-xs">
      <Stack
        gap="sm"
        className="rounded-md border border-dashed border-border px-md py-lg"
        onFocus={onArm}
      >
        <Stack direction="row" gap="xs" align="center" className="text-muted-foreground">
          <MdSmartDisplay className="size-4 shrink-0" />
          <Text variant="caption" tone="muted">
            Paste a link to embed (YouTube, Vimeo, Spotify, …)
          </Text>
        </Stack>
        <Stack direction="row" gap="sm" align="center">
          <Input
            value={value}
            placeholder="https://…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button type="button" disabled={!value.trim()} onClick={submit}>
            Embed
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}

function FilledEmbedBlock({ url, onReplace }: { url: string; onReplace: () => void }) {
  return (
    <div className="px-md py-xs">
      <div className="group">
        <Stack direction="row" gap="sm" align="center" justify="end" className="mb-xs">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2xs text-caption text-muted-foreground hover:text-foreground hover:underline"
          >
            Open original
            <MdOpenInNew className="size-3 shrink-0" />
          </a>
          {/*
           * Escape hatch: many sites send X-Frame-Options / CSP frame-ancestors
           * and refuse to render in an iframe. That refusal happens inside the
           * browser and is NOT reliably detectable from our JS (no error event,
           * no readable cross-origin state), so we always expose "Open original"
           * plus a way to swap the URL out.
           */}
          <button
            type="button"
            onClick={onReplace}
            className={cn(
              "text-caption text-muted-foreground opacity-0 transition-opacity",
              "group-hover:opacity-100 hover:text-foreground hover:underline",
            )}
          >
            Replace URL
          </button>
        </Stack>
        <div className="relative w-full aspect-video">
          <iframe
            src={toEmbedUrl(url)}
            className="absolute inset-0 h-full w-full rounded-md border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
            title="Embedded content"
          />
        </div>
      </div>
    </div>
  );
}
