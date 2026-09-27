import { WebsiteHero } from "@plugins/apps/plugins/website/plugins/shell/web";

/**
 * The guide's heading: what the reader will do here, once equin is installed.
 */
export function GuideOpening() {
  return (
    <WebsiteHero
      kind="page"
      lead="Getting "
      accent="started"
      lede="Your first tasks, agents and changes, step by step."
    />
  );
}
