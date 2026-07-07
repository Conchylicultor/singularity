import { MdDownload } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  landingPane,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadsPane } from "@plugins/apps/plugins/website/plugins/downloads/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const HEADLINE = "Every app here ships three ways.";
const SUBHEAD =
  "The same composition releases as a native desktop app, a standalone web app, or a window inside the equin workspace — see it morph on the landing page.";

/**
 * Closing band of the Apps pillar page: hands the visitor to the landing's
 * release-targets band (the cross-pillar proof) and the Download CTA.
 */
export function AppsClosing() {
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
                See the release engine
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
