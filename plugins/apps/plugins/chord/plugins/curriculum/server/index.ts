import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import {
  applyCellEndpoint,
  setBlanksEndpoint,
  setChapterStateEndpoint,
  setChordStateEndpoint,
} from "../core";
import {
  handleApplyCell,
  handleSetBlanks,
  handleSetChapterState,
  handleSetChordState,
} from "./internal/handlers";
import { chordCurriculumServerResource } from "./internal/resource";

export default {
  description:
    "The Chord trainer's curriculum, server side: the chord_curriculum row (each chord practised, heard or off; how much of a loop is blank; the key modes), the live chord.curriculum resource, and the four writes — one chord, a whole chapter, the blanks, or a cell of the path.",
  httpRoutes: {
    [setChordStateEndpoint.route]: handleSetChordState,
    [setChapterStateEndpoint.route]: handleSetChapterState,
    [setBlanksEndpoint.route]: handleSetBlanks,
    [applyCellEndpoint.route]: handleApplyCell,
  },
  contributions: [
    // `chord_curriculum` is kept in forks, backups and the change feed on
    // purpose (no ExcludeFromFork / ExcludeFromBackup / ExcludeFromChangeFeed):
    // it is the learner's own choice, which nothing can rebuild, and the feed
    // is what pushes `chord.curriculum`. No growth bound: it is one row.
    Resource.Declare(chordCurriculumServerResource),
  ],
} satisfies ServerPluginDefinition;
