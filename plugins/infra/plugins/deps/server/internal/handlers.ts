import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { installDepEndpoint, removeDepEndpoint } from "../../core";
import { removeDep } from "./ensure";
import { requestDep } from "./install-job";
import { declaredDep, UnknownDepError } from "./registry";

function lookup(id: string) {
  try {
    return declaredDep(id);
  } catch (err) {
    if (err instanceof UnknownDepError) throw new HttpError(404, err.message);
    throw err;
  }
}

export const handleInstallDep = implement(
  installDepEndpoint,
  async ({ body }) => {
    const dep = lookup(body.id);
    await requestDep(dep);
    return { id: dep.id };
  },
);

export const handleRemoveDep = implement(
  removeDepEndpoint,
  async ({ body }) => {
    const outcome = await removeDep(lookup(body.id));
    if (outcome.kind === "busy") {
      throw new HttpError(
        409,
        `${body.id} is being installed (or swept) right now; remove it once that finishes.`,
      );
    }
    return outcome;
  },
);
