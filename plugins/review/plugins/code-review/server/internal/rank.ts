import { nextRankIn } from "@plugins/primitives/plugins/rank/server";
import { reviewSectionsTable } from "./tables";

export async function nextRank(): Promise<string> {
  return (await nextRankIn(reviewSectionsTable)).toJSON();
}
