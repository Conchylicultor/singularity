import { MdDownload } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { downloadsPane } from "@plugins/apps/plugins/website/plugins/downloads/web";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inset, Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

const HEADLINE = "Ready to try equin?";
const SUBHEAD =
  "Download the app and start composing your own workspace from shared building blocks.";

/**
 * The closing CTA band — a short headline over a primary Download button that
 * takes the visitor to the downloads pane.
 */
export function CtaSection() {
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
            <Button onClick={() => openPane(downloadsPane, {}, { mode: "root" })}>
              <MdDownload />
              Download equin
            </Button>
          </ControlSizeProvider>
        </Stack>
      </Inset>
    </section>
  );
}
