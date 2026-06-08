import { join } from "path";
import {
  createFacet,
} from "@plugins/plugin-meta/plugins/facets/core";
import {
  readIfExists,
  stripTypes,
  maskSource,
  parseDefineGroup,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type CommandDef, commandsFacetDef } from "../core";

export default createFacet<CommandDef[]>({
  def: commandsFacetDef,

  extract(ctx) {
    const src = readIfExists(join(ctx.dir, "web", "commands.ts"));
    if (!src) return [];
    // stripTypes drops comments on the happy path; masking comments/regex (keeping
    // command-id strings) additionally defends the transpile-failure fallback so a
    // commented `defineCommand("x")` can never be parsed as a real command.
    return parseDefineGroup(
      maskSource(stripTypes(src), { strings: false }),
      "defineCommand",
      (memberName, commandId, groupName) => ({ memberName, commandId, groupName }),
    );
  },

  renderDoc(data) {
    if (data.length === 0) return [];
    return [
      { folder: "web", key: "Commands", values: data.map((c) => `\`${c.groupName}.${c.memberName}\``) },
    ];
  },
});
