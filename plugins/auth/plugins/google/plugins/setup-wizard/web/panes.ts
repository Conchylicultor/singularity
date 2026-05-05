import { Pane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { GoogleSetupPane } from "./components/google-setup-pane";

export const googleSetupPane = Pane.define({
  id: "google-setup",
  after: [accountsPane],
  segment: "google/setup",
  component: GoogleSetupPane,
  chrome: { title: "Connect Google", history: false, close: true },
});
