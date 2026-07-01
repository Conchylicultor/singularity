import { Pane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { AppleSetupPane } from "./components/apple-setup-pane";

export const appleSetupPane = Pane.define({
  id: "apple-setup",
  defaultAncestors: [accountsPane],
  segment: "apple/setup",
  component: AppleSetupPane,
  chrome: { title: "Set up Apple Signing", history: false, close: true },
});
