import { WebsiteHero } from "@plugins/apps/plugins/website/plugins/shell/web";

/**
 * The foundations page's heading — the same words as the homepage's first
 * layer card, so following the card confirms rather than re-introduces.
 */
export function FoundationsOpening() {
  return (
    <WebsiteHero
      kind="page"
      lead="The technical "
      accent="foundations"
      lede="A platform (framework, harness, plugin system) to build production-grade applications autonomously. 1M+ lines of code without human review."
    />
  );
}
