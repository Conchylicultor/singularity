export {
  DOM_TEST_INCLUDE,
  BUN_TEST_IGNORE,
  DOM_TEST_SETUP_FILE,
  DOM_TEST_CLOCK_PIN,
  TEST_FILE_GLOB,
  isTestFilePath,
  isDomTestPath,
  isBunTestPath,
  partitionTestPaths,
} from "./test-layout";
export {
  FAKE_DOM_GLOBALS,
  fakeDomInstalls,
  type FakeDomInstall,
} from "./fake-dom";
