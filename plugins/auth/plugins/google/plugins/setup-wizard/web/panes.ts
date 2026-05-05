import { Pane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { GoogleSetupPane } from "./components/google-setup-pane";

export const googleSetupPane = Pane.define({
  id: "google-setup",
  parent: accountsPane,
  path: "google/setup",
  component: GoogleSetupPane,
  chrome: { title: "Connect Google", history: false, close: true },
});
