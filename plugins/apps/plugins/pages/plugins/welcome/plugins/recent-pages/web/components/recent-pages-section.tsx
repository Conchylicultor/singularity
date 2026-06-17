import { type ReactElement } from "react";
import { MdArrowForward } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";

const RECENT_LIMIT = 6;

export function RecentPagesSection(): ReactElement | null {
  const openPane = useOpenPane();
  const result = useResource(pagesResource);

  if (result.pending) {
    return (
      <Stack gap="md">
        <Text as="span" variant="label" tone="muted">
          Recent pages
        </Text>
        <Loading variant="rows" count={3} />
      </Stack>
    );
  }

  // Quick-create already covers first creation; omit the section entirely when
  // there are no pages yet rather than rendering an empty header.
  if (result.data.length === 0) return null;

  const recent = result.data
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, RECENT_LIMIT);

  return (
    <Stack gap="md">
      <Text as="span" variant="label" tone="muted">
        Recent pages
      </Text>
      <Card className="flex flex-col divide-y overflow-hidden rounded-lg p-none">
        {recent.map((page) => {
          const { title, iconSvgNodes } = pageData(page);
          return (
            <button
              key={page.id}
              className="flex items-center gap-md px-md py-sm text-left transition-colors hover:bg-accent"
              onClick={() =>
                openPane(pageDetailPane, { pageId: page.id }, { mode: "push" })
              }
            >
              <PageIcon nodes={iconSvgNodes} className="size-5 shrink-0 text-muted-foreground" />
              <TruncatingText className="flex-1 text-body">
                {title || "Untitled"}
              </TruncatingText>
              <RelativeTime
                date={page.updatedAt}
                className="shrink-0 text-caption text-muted-foreground"
              />
              <MdArrowForward className="size-4 shrink-0 text-muted-foreground/50" />
            </button>
          );
        })}
      </Card>
    </Stack>
  );
}
