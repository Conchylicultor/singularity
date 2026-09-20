import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConversationArtifacts } from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/web";
import { SKILL_KIND, extractSkills } from "./internal/skills";
import { SKILL_ICON, SkillSection } from "./components/skill-section";

export default {
  description:
    "Skills as a conversation artifact: every skill the agent loaded, as a wrapped strip of monospace name chips — a repo skill opens its SKILL.md in the file-peek pane, a plugin-packaged skill has no file here and says so.",
  contributions: [
    ConversationArtifacts.Kind({
      id: SKILL_KIND,
      label: "Skills",
      icon: SKILL_ICON,
      extract: extractSkills,
      Section: SkillSection,
    }),
  ],
} satisfies PluginDefinition;
