import { defineCommand } from "@plugins/framework/plugins/web-sdk/core";

export const CommandPaletteCommands = {
  Open: defineCommand<{ open: boolean }, void>("command-palette.open"),
  Toggle: defineCommand<undefined, void>("command-palette.toggle"),
};
