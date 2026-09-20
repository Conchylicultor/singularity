import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import {
  nextCurriculumStepEndpoint,
  undoCurriculumStepEndpoint,
  unlockCurriculumStepEndpoint,
} from "../core";
import {
  handleNextStep,
  handleUndoStep,
  handleUnlockStep,
} from "./internal/handlers";
import { chordCurriculumServerResource } from "./internal/resource";

export default {
  description:
    "The Chord trainer's curriculum: the chord_unlocks ladder the learner climbs, the live chord.curriculum standing (what they hear and how much of a loop they name), the next step ranked by how many real songs it opens, and the unlock / undo writes.",
  httpRoutes: {
    [nextCurriculumStepEndpoint.route]: handleNextStep,
    [unlockCurriculumStepEndpoint.route]: handleUnlockStep,
    [undoCurriculumStepEndpoint.route]: handleUndoStep,
  },
  contributions: [
    // `chord_unlocks` is kept in forks, backups and the change feed on purpose
    // (no ExcludeFromFork / ExcludeFromBackup / ExcludeFromChangeFeed): it is
    // the learner's own history of decisions, which nothing can rebuild, and
    // the feed is what pushes `chord.curriculum`. No growth bound: a row is
    // written only when a person takes a step. See CLAUDE.md.
    Resource.Declare(chordCurriculumServerResource),
  ],
} satisfies ServerPluginDefinition;
