import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface CommandDef {
  memberName: string;
  commandId: string;
  groupName: string;
}

export const commandsFacetDef = defineFacet<CommandDef[]>("commands");
