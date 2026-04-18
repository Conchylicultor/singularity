import { defineCommand } from "@core";

export const Agents = {
  OpenAgent: defineCommand<{ id: string | null }, void>("agents.open-agent"),
};
