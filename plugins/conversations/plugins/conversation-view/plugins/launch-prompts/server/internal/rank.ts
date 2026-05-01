import { nextRankIn } from "@plugins/primitives/plugins/rank/server";
import { launchPromptsTable } from "./tables";

export async function nextRank(): Promise<string> {
  return nextRankIn(launchPromptsTable);
}
