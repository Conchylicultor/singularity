export {
  checkNoOverlap,
  checkNoClip,
  checkLeftPack,
  checkRigidIntegrity,
  checkPinnedRight,
  checkNeverTruncatesWhenRoomy,
  checkTruncationOnsetOrder,
  checkTruncatesTogether,
  checkRailAlignment,
  checkOpticalCenter,
} from "./oracle";
export type { OracleResult } from "./oracle";
export {
  GEOMETRY_VIOLATION_MARKER,
  FALSIFICATION_NOT_BITING_MARKER,
  FIXTURE_PAGE_ERROR_MARKER,
  FATAL_MARKERS,
} from "./failure-markers";
export type { MeasuredBox, MeasuredFixture } from "./types";
