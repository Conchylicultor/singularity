import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useBrowserNav, Favicon } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { browserRecentsResource } from "@plugins/apps/plugins/browser/plugins/history/web";

/**
 * The "Recent" section: rows of recently visited pages from the live
 * `browser-recents` resource (distinct-by-url, newest first). Each row shows a
 * favicon, the page title, and a relative visit time; clicking navigates.
 * Rendered only once data is present and non-empty.
 */
export function RecentsSection() {
  const { navigate } = useBrowserNav();
  const result = useResource(browserRecentsResource);

  return matchResource(result, {
    pending: () => null,
    ready: (recents) => {
      if (recents.length === 0) return null;
      return (
        <Stack gap="sm">
          <SectionLabel>Recent</SectionLabel>
          <Stack gap="2xs">
            {recents.map((r) => (
              <Row
                key={r.url}
                hover="muted"
                title={r.url}
                icon={<Favicon url={r.url} size={16} />}
                onClick={() => navigate(r.url)}
                actions={
                  <Text variant="caption" tone="muted">
                    <RelativeTime date={r.visitedAt} />
                  </Text>
                }
                actionsAlwaysVisible
              >
                <Text>{r.title}</Text>
              </Row>
            ))}
          </Stack>
        </Stack>
      );
    },
  });
}
