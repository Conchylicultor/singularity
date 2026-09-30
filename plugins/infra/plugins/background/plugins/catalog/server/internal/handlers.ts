import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { runBackgroundNowEndpoint } from "../../core";
import { providerOf, UnknownBackgroundKindError } from "../../shared/providers";

export const handleRunBackgroundNow = implement(
  runBackgroundNowEndpoint,
  async ({ body }) => {
    const provider = lookup(body.kind);
    const entry = (await provider.list()).find((e) => e.name === body.name);
    if (entry === undefined) {
      throw new HttpError(
        404,
        `No ${body.kind} named "${body.name}" is declared here.`,
      );
    }
    if (!entry.canRunNow || provider.runNow === undefined) {
      throw new HttpError(
        409,
        `${body.kind} "${body.name}" cannot be started by hand.`,
      );
    }
    return provider.runNow(body.name);
  },
);

function lookup(kind: string) {
  try {
    return providerOf(kind);
  } catch (err) {
    if (err instanceof UnknownBackgroundKindError) {
      throw new HttpError(404, err.message);
    }
    throw err;
  }
}
