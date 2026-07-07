import { MdDownload } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { downloadsPane } from "@plugins/apps/plugins/website/plugins/downloads/web";
import { appsPane } from "@plugins/apps/plugins/website/plugins/pillars/plugins/apps/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const HEADLINE = "The proof is what they ship.";
const SUBHEAD =
  "Every app on this site — Pages, Mail, Sonata, Workflows — was built through this loop. Meet the apps, or start your own workspace.";

/**
 * Closing band of the Agents pillar page: hands the visitor to the Apps
 * pillar (the agents' output) and the Download CTA.
 */
export function AgentsClosing() {
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
                onClick={() => openPane(appsPane, {}, { mode: "root" })}
              >
                Meet the apps
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
