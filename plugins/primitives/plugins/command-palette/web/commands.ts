import { defineCommand } from "@core";

export const CommandPaletteCommands = {
  Open: defineCommand<{ open: boolean }, void>("command-palette.open"),
  Toggle: defineCommand<undefined, void>("command-palette.toggle"),
};
