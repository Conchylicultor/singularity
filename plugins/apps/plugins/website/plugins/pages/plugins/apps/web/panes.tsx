import { useState } from "react";
import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
  WebsiteHero,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { AppsSearch } from "./components/apps-search";
import { AppsGallery, type CategoryFilter } from "./components/apps-gallery";
import { AppsCompose, AppsReadNext } from "./components/apps-closing";

/**
 * The apps gallery at `/website/apps` — every app equin ships, searchable and
 * grouped by category. Wears the shared site header (`actions: WebsiteHeader`);
 * the heading with the search under it, the gallery, the "Missing an app?"
 * band, then the two pages to read next, inside `WebsiteChrome`.
 */
export const appsPane = Pane.define({
  route: defineRoute({ id: "website-apps", segment: "apps" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: AppsBody,
});

function AppsBody() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  return (
    <WebsiteChrome pane={appsPane}>
      <WebsiteHero
        kind="page"
        lead="The "
        accent="apps"
        lede="Every app equin ships. Each one is a composition of plugins: install it as is, or ask an agent to reshape it for you."
      >
        <AppsSearch query={query} onQueryChange={setQuery} />
      </WebsiteHero>
      <AppsGallery
        query={query}
        category={category}
        onCategoryChange={setCategory}
      />
      <AppsCompose />
      <AppsReadNext />
    </WebsiteChrome>
  );
}
