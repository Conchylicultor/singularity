import { type ReactElement } from "react";
import { MdArrowForward } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
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
      <Card className="rounded-lg p-none">
        <Clip className="rounded-lg">
          <Stack gap="none" className="divide-y">
            {recent.map((page) => {
              const { title, iconSvgNodes } = pageData(page);
              return (
                <Frame
                  key={page.id}
                  as="button"
                  gap="md"
                  className="px-md py-sm text-left transition-colors hover:bg-accent"
                  onClick={() =>
                    openPane(pageDetailPane, { pageId: page.id }, { mode: "push" })
                  }
                  leading={
                    <PageIcon nodes={iconSvgNodes} className="size-5 text-muted-foreground" />
                  }
                  content={
                    <TruncatingText className="text-body">
                      {title || "Untitled"}
                    </TruncatingText>
                  }
                  trailing={
                    <Stack direction="row" gap="md" align="center">
                      <RelativeTime
                        date={page.updatedAt}
                        className="text-caption text-muted-foreground"
                      />
                      <MdArrowForward className="size-4 text-muted-foreground/50" />
                    </Stack>
                  }
                />
              );
            })}
          </Stack>
        </Clip>
      </Card>
    </Stack>
  );
}
