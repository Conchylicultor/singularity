export { fixturesCollectedDir } from "./collected";
export { loadFixtures } from "./load-fixtures";
export {
  evaluateInvariant,
  checkNoOverlap,
  checkNoClip,
  checkLeftPack,
  checkRigidIntegrity,
  checkPinnedRight,
  checkNeverTruncatesWhenRoomy,
  checkTruncationOnsetOrder,
  checkTruncatesTogether,
  checkRailAlignment,
} from "./oracle";
export type { OracleResult } from "./oracle";
export {
  GEOMETRY_VIOLATION_MARKER,
  FALSIFICATION_NOT_BITING_MARKER,
  FIXTURE_PAGE_ERROR_MARKER,
  FATAL_MARKERS,
  geometryViolationError,
  falsificationDidNotBiteError,
  fixturePageError,
} from "./failure-markers";
export { isLayoutFixture, isRegionFixture, HOST_MARKER_ATTR } from "./types";
export type {
  FixtureState,
  FixtureDims,
  MeasuredBox,
  MeasuredFixture,
  GeometryInvariant,
  FixtureMutation,
  LayoutFixture,
  RegionFixture,
  HarnessFixture,
} from "./types";
