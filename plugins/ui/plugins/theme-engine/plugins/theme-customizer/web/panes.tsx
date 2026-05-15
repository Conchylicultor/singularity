import { Pane } from "@plugins/primitives/plugins/pane/web";
import { ThemeCustomizerBody } from "./components/theme-customizer";

export const themeCustomizerPane = Pane.define({
  id: "theme-customizer",
  after: [null],
  segment: "theme-customizer",
  component: ThemeCustomizerBody,
  width: 440,
});
