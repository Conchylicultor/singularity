import { nextRankIn } from "@plugins/primitives/plugins/rank/server";
import { quickPromptsTable } from "./tables";

export async function nextRank(): Promise<string> {
  return nextRankIn(quickPromptsTable);
}
