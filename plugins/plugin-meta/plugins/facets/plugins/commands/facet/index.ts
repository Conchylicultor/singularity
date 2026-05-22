import { join } from "path";
import {
  defineFacet,
  type Facet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  type CommandDef,
  readIfExists,
  stripTypes,
  parseDefineGroup,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";

export const commandsFacetDef = defineFacet<CommandDef[]>("commands");

const commandsFacet: Facet = {
  def: commandsFacetDef,

  extract(ctx: unknown): CommandDef[] {
    const { dir } = ctx as { dir: string };
    const src = readIfExists(join(dir, "web", "commands.ts"));
    if (!src) return [];
    return parseDefineGroup(
      stripTypes(src),
      "defineCommand",
      (memberName, commandId, groupName) => ({ memberName, commandId, groupName }),
    );
  },

  renderDoc(data: unknown, ctx: unknown): string[] {
    const commands = data as CommandDef[];
    if (commands.length === 0) return [];
    const { bodyIndent } = ctx as { bodyIndent: string };
    const subIndent = `${bodyIndent}  `;
    return [
      `${subIndent}- Commands: ${commands.map((c) => `\`${c.groupName}.${c.memberName}\``).join(", ")}`,
    ];
  },
};

export default commandsFacet;
