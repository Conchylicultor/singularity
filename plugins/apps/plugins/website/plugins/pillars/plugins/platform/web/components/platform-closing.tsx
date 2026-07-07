import { MdDownload } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { landingPane } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadsPane } from "@plugins/apps/plugins/website/plugins/downloads/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const HEADLINE = "See a release happen.";
const SUBHEAD =
  "The pyramid tops out at the release engine: one composition shipping as a desktop app, a web app, or a window in the workspace. Watch it morph on the landing page.";

/**
 * Closing band of the Platform pillar page: hands the visitor to the
 * landing's release-targets band (the pyramid's top tier, live) and the
 * Download CTA.
 */
export function PlatformClosing() {
  const openPane = useOpenPane();
  return (
    <section className="bg-linear-to-b from-card to-primary/10">
      <Inset x="xl" y="2xl">
        <Stack
          gap="lg"
          align="center"
          className="mx-auto w-full max-w-5xl text-center"
        >
          <Text as="h2" variant="heading" className="tracking-tight">
            {HEADLINE}
          </Text>
          <Text as="p" variant="body" tone="muted" className="max-w-xl">
            {SUBHEAD}
          </Text>
          <ControlSizeProvider size="lg">
            <Stack direction="row" gap="sm" justify="center">
              <Button
                variant="ghost"
                onClick={() => openPane(landingPane, {}, { mode: "root" })}
              >
                Back to the landing page
              </Button>
              <Button
                onClick={() => openPane(downloadsPane, {}, { mode: "root" })}
              >
                <MdDownload />
                Download equin
              </Button>
            </Stack>
          </ControlSizeProvider>
        </Stack>
      </Inset>
    </section>
  );
}
