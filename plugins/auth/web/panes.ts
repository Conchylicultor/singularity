import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { AccountsPane } from "./components/accounts-pane";

/**
 * Exported because the setup wizards (Google, Google Maps, Apple signing) each
 * live in their own sub-plugin and chain off this route.
 *
 * It stays in `web/` rather than moving to `core/`, even though `auth/core`
 * exists: `auth/plugins/google/web` already imports its own setup wizard, and a
 * `core`-tagged edge back from that wizard to `auth` is folded into the server
 * and central cycle graphs where a `web`-tagged one is not. Nothing server-side
 * needs to build this link, so there is nothing to buy by promoting it.
 */
export const accountsRoute = defineRoute({
  id: "accounts",
  segment: "accounts",
});

export const accountsPane = Pane.define({
  route: accountsRoute,
  app: settingsApp,
  component: AccountsPane,
  chrome: { title: "Accounts", history: true },
});
