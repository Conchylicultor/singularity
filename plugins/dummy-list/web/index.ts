import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdList } from "react-icons/md";
import { DummyList } from "./components/dummy-list";

const dummyListPlugin: PluginDefinition = {
  id: "dummy-list",
  name: "Dummy List",
  contributions: [
    Shell.Sidebar({
      title: "Items",
      icon: MdList,
      component: DummyList,
    }),
  ],
};

export default dummyListPlugin;
