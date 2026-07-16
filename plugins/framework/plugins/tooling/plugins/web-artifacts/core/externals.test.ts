import { describe, expect, test } from "bun:test";
import { makeArtifactExternal } from "./externals";
import { isBareSpecifier, packageNameOf } from "./constants";

describe("makeArtifactExternal (web artifact of tasks/plugins/task-detail)", () => {
  const external = makeArtifactExternal("tasks/plugins/task-detail");

  test("other plugins' barrels are external", () => {
    expect(external("@plugins/shell/web")).toBe(true);
    expect(external("@plugins/primitives/plugins/pane/web")).toBe(true);
    expect(external("@plugins/tasks/plugins/tasks-core/core")).toBe(true);
  });

  test("own core barrel is ALWAYS external (single instance)", () => {
    expect(external("@plugins/tasks/plugins/task-detail/core")).toBe(true);
  });

  test("own shared / own deep files are inlined", () => {
    expect(external("@plugins/tasks/plugins/task-detail/shared")).toBe(false);
    expect(external("@plugins/tasks/plugins/task-detail/shared/protocol")).toBe(false);
    expect(external("@plugins/tasks/plugins/task-detail/core/internal/util")).toBe(false);
  });

  test("own SUB-plugins are different plugins — external", () => {
    expect(external("@plugins/tasks/plugins/task-detail/plugins/child/web")).toBe(true);
  });

  test("a sibling whose path shares a prefix is external (prefix ends at '/')", () => {
    expect(external("@plugins/tasks/plugins/task-detail-extra/web")).toBe(true);
  });

  test("bare npm specifiers are external", () => {
    expect(external("react")).toBe(true);
    expect(external("react-dom/client")).toBe(true);
    expect(external("@xyflow/react")).toBe(true);
  });

  test("inline-allowlisted packages are inlined (any subpath)", () => {
    expect(external("react-icons/md")).toBe(false);
    expect(external("react-icons")).toBe(false);
  });

  test("relative / absolute / virtual ids are never external", () => {
    expect(external("./components/detail")).toBe(false);
    expect(external("../shared/protocol")).toBe(false);
    expect(external("/abs/path.ts")).toBe(false);
    expect(external("\0virtual")).toBe(false);
  });

  test("the registry alias is external (import-map entry)", () => {
    expect(external("@composition-web-registry")).toBe(true);
  });

  test("CSS specifiers stay in-graph (never module URLs)", () => {
    expect(external("@plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css")).toBe(false);
    expect(external("react-diff-view/style/index.css")).toBe(false);
    expect(external("@xterm/xterm/css/xterm.css")).toBe(false);
    expect(external("katex/dist/katex.min.css")).toBe(false);
  });
});

describe("entry artifact (ownPluginPath null)", () => {
  const external = makeArtifactExternal(null);
  test("all @plugins barrels external, relatives inlined", () => {
    expect(external("@plugins/framework/plugins/web-sdk/core")).toBe(true);
    expect(external("./App")).toBe(false);
  });
});

describe("specifier helpers", () => {
  test("packageNameOf", () => {
    expect(packageNameOf("react-dom/client")).toBe("react-dom");
    expect(packageNameOf("@xyflow/react/dist/style.css")).toBe("@xyflow/react");
    expect(packageNameOf("react")).toBe("react");
  });
  test("isBareSpecifier", () => {
    expect(isBareSpecifier("react")).toBe(true);
    expect(isBareSpecifier("@scope/pkg/sub")).toBe(true);
    expect(isBareSpecifier("./x")).toBe(false);
    expect(isBareSpecifier("/x")).toBe(false);
    expect(isBareSpecifier("@plugins/a/web")).toBe(false);
  });
});
