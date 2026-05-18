import { join } from "path";
import { getConversation } from "@plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getAllowFiles } from "../../shared/endpoints";

const ALLOW_FILES = [".allow-main", ".allow-migrations", ".allow-postgres"] as const;

export const handleGetAllowFiles = implement(getAllowFiles, async ({ params }) => {
  const conversation = await getConversation(params.id);
  if (!conversation?.worktreePath) {
    return { allowFiles: [] };
  }

  const results = await Promise.all(
    ALLOW_FILES.map(async (name) => ({
      name,
      exists: await Bun.file(join(conversation.worktreePath!, name)).exists(),
    })),
  );

  return {
    allowFiles: results.filter((r) => r.exists).map((r) => r.name),
  };
});
