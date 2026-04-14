import { defineCommand } from "@core";

export const Tasks = {
  OpenTask: defineCommand<{ id: string | null }, void>("tasks.open-task"),
};
