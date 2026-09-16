import { WebsiteHero } from "@plugins/apps/plugins/website/plugins/shell/web";

/**
 * The story page's heading — the words the homepage's story link offers ("how
 * equin came to be"), so following the link confirms rather than re-introduces.
 */
export function StoryOpening() {
  return (
    <WebsiteHero
      kind="page"
      lead="How equin "
      accent="came to be"
      lede="Eight years at Google Brain and DeepMind as an AI research engineer. Then, in one week, Claude Opus 4.6 changed everything. A month later, a resignation, and an agentic project built alone. How did that happen?"
    />
  );
}
