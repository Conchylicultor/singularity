import type { GmailLabel, GmailListLabelsResponse } from "../../core";
import { gmailRequest } from "./request";

export async function listLabels(token: string): Promise<GmailLabel[]> {
  const res = await gmailRequest<GmailListLabelsResponse>(token, "/labels");
  return res.labels ?? [];
}
