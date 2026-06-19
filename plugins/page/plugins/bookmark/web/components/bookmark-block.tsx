import { useEffect, useRef, useState } from "react";
import { MdBookmark, MdRefresh } from "react-icons/md";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Button, Input, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { bookmarkBlock, linkPreviewEndpoint } from "../../core";

/**
 * Three states keyed on `(url, fetched)`:
 *  1. `!url` → URL-input empty state. Submit just sets the url (no fetch here).
 *  2. `url && !fetched` → loading card; auto-fetches the link preview once per
 *     url, then writes the metadata + `fetched: true`. This is the single fetch
 *     path shared by manual entry and `convertTo(BOOKMARK_TYPE, { url })` from
 *     paste-to-bookmark.
 *  3. `url && fetched` → the final preview card.
 */
export function BookmarkBlock({ block, editor }: BlockRendererProps) {
  const { url, title, description, siteName, imageId, faviconId, fetched } =
    bookmarkBlock.parse(block.data);

  if (!url) {
    return <EmptyBookmarkBlock editor={editor} onArm={() => editor.onFocus()} />;
  }

  if (!fetched) {
    return <FetchingBookmarkBlock url={url} editor={editor} />;
  }

  return (
    <FilledBookmarkBlock
      url={url}
      title={title}
      description={description}
      siteName={siteName}
      imageId={imageId}
      faviconId={faviconId}
      editor={editor}
    />
  );
}

function EmptyBookmarkBlock({
  editor,
  onArm,
}: {
  editor: BlockRendererProps["editor"];
  onArm: () => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const url = value.trim();
    if (!url) return;
    // Just set the url — the fetch happens in the loading state (state 2) so
    // manual entry and paste-to-bookmark share one fetch path.
    editor.update({ url });
  }

  return (
    <Inset x="md" y="xs">
      <Stack direction="row" gap="sm" align="center">
        <MdBookmark className="size-4 text-muted-foreground" />
        <Input
          value={value}
          placeholder="Paste a link…"
          onFocus={onArm}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="button" disabled={!value.trim()} onClick={submit}>
          Add bookmark
        </Button>
      </Stack>
    </Inset>
  );
}

function FetchingBookmarkBlock({
  url,
  editor,
}: {
  url: string;
  editor: BlockRendererProps["editor"];
}) {
  const [error, setError] = useState<string | null>(null);
  // Guard against a double-fetch (StrictMode double-mount, re-render): only run
  // once per url. Keyed on the url so a replaced url re-fetches.
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedRef.current === url) return;
    startedRef.current = url;
    setError(null);

    async function run() {
      try {
        const meta = await fetchEndpoint(linkPreviewEndpoint, {}, { query: { url } });
        editor.update({
          url,
          ...meta,
          // Mirror the cached image ids into the shared attachment convention so
          // the generic reconcile links them (otherwise the orphan sweep reclaims).
          attachmentIds: [meta.imageId, meta.faviconId].filter(
            (id): id is string => Boolean(id),
          ),
          fetched: true,
        });
      } catch (e) {
        // Fail loud — surface the error inline and mark fetched so we don't loop.
        setError(e instanceof Error ? e.message : String(e));
        editor.update({ url, fetched: true });
      }
    }
    void run();
  }, [url, editor]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch (err) {
    // `new URL` throws TypeError on an unparseable url — keep the raw url as the
    // displayed host. Re-throw anything unexpected.
    if (!(err instanceof TypeError)) throw err;
  }

  return (
    <Inset x="md" y="xs">
      <Card className="p-md">
        <Frame
          gap="md"
          leading={<MdBookmark className="size-4 text-muted-foreground" />}
          content={
            <Stack gap="2xs">
              <Text variant="label" className="truncate font-semibold">
                {hostname}
              </Text>
              {error ? (
                <Placeholder tone="error">{error}</Placeholder>
              ) : (
                <Loading variant="text" label="Fetching preview…" />
              )}
            </Stack>
          }
        />
      </Card>
    </Inset>
  );
}

function FilledBookmarkBlock({
  url,
  title,
  description,
  siteName,
  imageId,
  faviconId,
  editor,
}: {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  imageId?: string;
  faviconId?: string;
  editor: BlockRendererProps["editor"];
}) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch (err) {
    // `new URL` throws TypeError on an unparseable url — keep the raw url as the
    // displayed host. Re-throw anything unexpected.
    if (!(err instanceof TypeError)) throw err;
  }

  return (
    <Inset x="md" y="xs">
      <div className={cn(hoverRevealGroup, "relative")}>
        <Card as="a" interactive href={url} target="_blank" rel="noreferrer" className="p-none no-underline">
          <Clip>
            <Stack direction="row" gap="md" align="stretch">
              {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible truncating column beside a full-height stretched image; Frame's center-align can't express the items-stretch card */}
              <Stack gap="2xs" className="min-w-0 flex-1 p-md">
                <Stack direction="row" gap="2xs" align="center">
                  {faviconId ? (
                    <img src={attachmentUrl(faviconId)} alt="" className="size-4 rounded-sm" />
                  ) : null}
                  {siteName ? (
                    <Text variant="caption" tone="muted" className="truncate">
                      {siteName}
                    </Text>
                  ) : null}
                </Stack>
                <Text variant="label" className="line-clamp-2 font-semibold">
                  {title ?? url}
                </Text>
                {description ? (
                  <Text variant="caption" tone="muted" className="line-clamp-2">
                    {description}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted" className="truncate">
                  {hostname}
                </Text>
              </Stack>
              {imageId ? (
                <img
                  src={attachmentUrl(imageId)}
                  alt=""
                  className="h-auto w-32 object-cover"
                />
              ) : null}
            </Stack>
          </Clip>
        </Card>
        <Pin to="top-right" offset="xs">
          <button
            type="button"
            aria-label="Replace bookmark"
            onClick={() => editor.update({})}
            className={cn(hoverRevealTarget, "size-6 rounded-full bg-black/50 text-white hover:bg-black/70")}
          >
            <Center className="size-full">
              <MdRefresh className="size-4" />
            </Center>
          </button>
        </Pin>
      </div>
    </Inset>
  );
}
