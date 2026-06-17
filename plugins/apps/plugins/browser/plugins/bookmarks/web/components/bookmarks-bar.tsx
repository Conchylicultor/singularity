import { MdClose } from "react-icons/md";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useBrowserNav,
  Favicon,
} from "@plugins/apps/plugins/browser/plugins/shell/web";
import { useBookmarks } from "../internal/use-bookmarks";
import { hostOf } from "../internal/host-of";

/**
 * The bookmarks bar — a `pane`-tier sub-row of clickable chips, one per
 * bookmark. Clicking a chip navigates; a hover-revealed × removes it. Renders
 * nothing while loading or when there are no bookmarks (no empty chrome row).
 */
export function BookmarksBar() {
  const { navigate } = useBrowserNav();
  const { result, remove } = useBookmarks();

  return matchResource(result, {
    pending: () => null,
    ready: (bookmarks) => {
      if (bookmarks.length === 0) return null;
      return (
        <Bar tier="pane">
          <Stack direction="row" gap="2xs" align="center">
            {bookmarks.map((b) => (
              <Row
                key={b.id}
                as="button"
                size="sm"
                hover="muted"
                className="w-auto"
                title={b.title}
                icon={<Favicon url={b.url} size={14} />}
                onClick={() => navigate(b.url)}
                actions={
                  <IconButton
                    icon={MdClose}
                    label="Remove bookmark"
                    tooltip="Remove bookmark"
                    size="icon-xs"
                    onClick={() => void remove(b.id)}
                  />
                }
              >
                <TruncatingText>{hostOf(b.url)}</TruncatingText>
              </Row>
            ))}
          </Stack>
        </Bar>
      );
    },
  });
}
