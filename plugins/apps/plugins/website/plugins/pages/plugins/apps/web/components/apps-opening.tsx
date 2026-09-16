import { WebsiteHero } from "@plugins/apps/plugins/website/plugins/shell/web";

/**
 * The applications page's heading: the vision this page argues, and the one
 * paragraph that says why now.
 */
export function AppsOpening() {
  return (
    <WebsiteHero
      kind="page"
      lead="A vision for "
      accent="applications"
      lede="Building an application used to be expensive. Legacy software only made sense because its cost could be amortized over a lot of users. That is not true anymore."
    />
  );
}
