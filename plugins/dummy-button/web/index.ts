import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdCircle } from "react-icons/md";
import { DummyPanel } from "./components/dummy-panel";

const dummyButtonPlugin: PluginDefinition = {
  id: "dummy-button",
  name: "Dummy Button",
  contributions: [
    Shell.Sidebar({
      title: "Dummy",
      icon: MdCircle,
      component: DummyPanel,
    }),
  ],
};

export default dummyButtonPlugin;
