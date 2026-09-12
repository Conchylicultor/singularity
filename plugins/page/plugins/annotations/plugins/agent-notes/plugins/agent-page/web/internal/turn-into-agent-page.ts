import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { turnIntoPage, type RichText } from "@plugins/page/plugins/editor/core";
import { textBlock } from "@plugins/page/plugins/text/core";
import { agentPageTitle } from "./title";

/**
 * `/agent-page`: turn the caret's line into an agent-authored page, in place —
 * the same atomic server op as "Turn into → Page", with the page marked
 * `author: "agent"` at birth. The server's turn-into-page is the one place a
 * page's author is chosen; every later data write keeps it.
 *
 * The line's own words become the title, exactly as "Turn into → Page" makes a
 * block's text its title — so `notes /agent-page` is an agent page titled
 * `notes`, and nothing the user typed disappears. `text` is the line with the
 * query already cut out (the menu hands it over); only an otherwise-empty line
 * gives an untitled page, the slot a human makes for an agent to fill and name.
 * Trimmed, because the cut leaves the space that stood before the `/`.
 *
 * `seedChild` comes from here for the reason `turn-into-page` gives: the editor
 * may not import a concrete block type, and a page with no child renders nothing
 * typeable.
 */
export async function turnIntoAgentPage(
  blockId: string,
  text: RichText,
): Promise<void> {
  await fetchEndpoint(
    turnIntoPage,
    { id: blockId },
    {
      body: {
        title: agentPageTitle(text),
        author: "agent",
        seedChild: {
          type: textBlock.type,
          data: textBlock.schema.parse({ text: [] }),
        },
      },
    },
  );
}
