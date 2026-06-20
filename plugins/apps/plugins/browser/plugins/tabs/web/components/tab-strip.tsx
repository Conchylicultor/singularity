import { MdAdd, MdClose } from "react-icons/md";
import { Bar } from "@plugins/primitives/plugins/bar/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useBrowserTabs,
  Favicon,
} from "@plugins/apps/plugins/browser/plugins/shell/web";

/** A readable label for a tab: the URL's host, or "New tab" for the start page. */
function tabLabel(url: string): string {
  if (!url) return "New tab";
  try {
    return new URL(url).hostname || url;
  } catch (err) {
    if (err instanceof TypeError) return url; // invalid URL — show raw
    throw err;
  }
}

/**
 * The in-app tab strip. One `Row` per navigation stack; clicking selects,
 * the hover-revealed × closes, and the trailing + opens a fresh start-page tab.
 */
export function TabStrip() {
  const { tabs, select, open, close } = useBrowserTabs();

  return (
    <Bar tier="pane">
      <Stack direction="row" gap="2xs" align="center" className="w-full">
        {tabs.map((tab) => (
          <Row
            key={tab.id}
            as="button"
            size="sm"
            hover="muted"
            selected={tab.active}
            className="max-w-52"
            title={tabLabel(tab.url)}
            icon={
              tab.loading ? <Spinner /> : <Favicon url={tab.url} size={14} />
            }
            onClick={() => select(tab.id)}
            actions={
              <ControlSizeProvider size="xs">
                <IconButton
                  icon={MdClose}
                  label="Close tab"
                  tooltip="Close tab"
                  onClick={() => close(tab.id)}
                />
              </ControlSizeProvider>
            }
          >
            <Text>{tabLabel(tab.url)}</Text>
          </Row>
        ))}
        <IconButton
          icon={MdAdd}
          label="New tab"
          tooltip="New tab"
          onClick={() => open()}
        />
      </Stack>
    </Bar>
  );
}
