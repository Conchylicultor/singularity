import { nextRankIn } from "@plugins/primitives/plugins/rank/server";
import { promptTemplatesTable } from "./tables";

export async function nextRank(): Promise<string> {
  return (await nextRankIn(promptTemplatesTable)).toJSON();
}
