import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { MdChecklist } from "react-icons/md";
import { tasksPane } from "./views";
import { Tasks as TasksSlots } from "./slots";
import { LaunchAgentAction } from "./components/launch-agent-action";
import { OpenDetailsAction } from "./components/open-details-action";

const tasksPlugin: PluginDefinition = {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts; meta-plugin hosting sub-pane contributions.",
  contributions: [
    Shell.Sidebar({
      title: "Tasks",
      icon: MdChecklist,
      group: "System",
      onClick: () => ShellCommands.OpenPane(tasksPane()),
    }),
    Shell.Route({
      pattern: "/tasks",
      resolve: () => tasksPane(),
    }),
    Shell.Route({
      pattern: "/tasks/:id",
      resolve: (params) => tasksPane({ id: params.id }),
    }),
    TasksSlots.TaskActions({ id: "launch-agent", component: LaunchAgentAction }),
    TasksSlots.TaskActions({ id: "open-details", component: OpenDetailsAction }),
  ],
};

export default tasksPlugin;
