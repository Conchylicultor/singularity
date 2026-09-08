import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WebsiteBand } from "@plugins/apps/plugins/website/plugins/shell/web";
import { storyPane } from "@plugins/apps/plugins/website/plugins/story/web";
import { MdArrowForward } from "react-icons/md";

const PROMPT = "Curious how equin came to be?";
const LINK = "Read the full story and context";

/**
 * The band between the fork and the contact block: one line offering the story
 * page to a reader who wants the context rather than either answer.
 *
 * It is a sentence with a link in it, not a call to action — the two cards above
 * are the page's real choices, and this must not compete with them. Which is why
 * it is one quiet line on its own rule, and why the button is `link` rather than
 * anything filled.
 */
export function StoryLinkSection() {
  const openPane = useOpenPane();
  return (
    <WebsiteBand divider y="xl">
      <Inline gap="xs" wrap>
        <Text as="p" variant="body" tone="muted">
          {PROMPT}
        </Text>
        <Button
          variant="link"
          onClick={() => openPane(storyPane, {}, { mode: "root" })}
        >
          {LINK}
          <MdArrowForward />
        </Button>
      </Inline>
    </WebsiteBand>
  );
}
