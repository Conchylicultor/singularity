import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const resetConfigField = defineEndpoint({
  route: "POST /api/config-v2/reset-field",
  body: z.object({ storePath: z.string(), key: z.string(), scopeId: z.string().optional() }),
});

export const acknowledgeConflict = defineEndpoint({
  route: "POST /api/config-v2/acknowledge-conflict",
  body: z.object({ storePath: z.string(), scopeId: z.string().optional() }),
});

export const deleteOverride = defineEndpoint({
  route: "POST /api/config-v2/delete-override",
  body: z.object({ storePath: z.string(), scopeId: z.string().optional() }),
});

// Three-way merge resolution for a hash conflict. Auto-merges fields only one
// side changed; returns the fields both sides changed differently (true
// conflicts) in `conflictKeys`. `resolved` is true when nothing truly conflicted
// and the conflict is fully cleared.
export const mergeConflict = defineEndpoint({
  route: "POST /api/config-v2/merge-conflict",
  body: z.object({ storePath: z.string(), scopeId: z.string().optional() }),
  response: z.object({ resolved: z.boolean(), conflictKeys: z.array(z.string()) }),
});

export const getConfigRawFile = defineEndpoint({
  route: "GET /api/config-v2/raw-file",
  query: z.object({ storePath: z.string(), scopeId: z.string().optional() }),
  // Four layered files: the user layer (~/.singularity/config/<wt>/) override +
  // origin (what the running app resolves to), and the git layer (<repo>/config/)
  // override + origin (defaults). The raw view surfaces them as User → Git → Origin.
  // `*Path` is the on-disk location (always present, even when the file is absent
  // and its content is null) so the UI can label each layer with its real path
  // without reconstructing it client-side.
  response: z.object({
    override: z.string().nullable(),
    overridePath: z.string(),
    origin: z.string().nullable(),
    originPath: z.string(),
    gitOverride: z.string().nullable(),
    gitOverridePath: z.string(),
    gitOrigin: z.string().nullable(),
    gitOriginPath: z.string(),
  }),
});
