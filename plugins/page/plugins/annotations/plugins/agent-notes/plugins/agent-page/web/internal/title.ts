import { plainOf, type RichText } from "@plugins/page/plugins/editor/core";

/**
 * An agent-authored page's title, from the line it was made from: the words the
 * user had on it besides the `/agent-page` query, trimmed — the cut leaves the
 * space that stood before the `/`. An otherwise-empty line gives `""`.
 */
export function agentPageTitle(text: RichText): string {
  return plainOf(text).trim();
}
