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
  checkRailAlignment,
} from "./oracle";
export type { OracleResult } from "./oracle";
export { isLayoutFixture, isRegionFixture } from "./types";
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
