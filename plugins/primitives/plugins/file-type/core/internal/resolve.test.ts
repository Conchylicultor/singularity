import { describe, expect, it } from "bun:test";
import { fileTypeOf } from "./resolve";
import { BY_EXTENSION, BY_NAME, BY_NAME_PREFIX } from "./table";

function glyph(name: string): string {
  return fileTypeOf(name).icon.name;
}

describe("fileTypeOf", () => {
  it("reads the extension", () => {
    expect(fileTypeOf("index.ts")).toEqual({
      icon: { kind: "seti", name: "typescript" },
      tone: "blue",
      label: "TypeScript",
      preview: "code",
    });
    expect(glyph("app.tsx")).toBe("react");
    expect(glyph("photo.PNG")).toBe("image");
    expect(fileTypeOf("notes.md").preview).toBe("markdown");
    expect(fileTypeOf("data.csv").preview).toBe("csv");
    expect(fileTypeOf("report.pdf").preview).toBe("pdf");
  });

  it("prefers the longest compound extension", () => {
    expect(fileTypeOf("icon.test.ts")).toMatchObject({
      icon: { name: "typescript" },
      tone: "orange",
    });
    expect(fileTypeOf("types.d.ts").label).toBe("TypeScript declarations");
    expect(fileTypeOf("main.tf.json").icon.name).toBe("terraform");
  });

  it("lets a special name beat its extension", () => {
    expect(fileTypeOf("package.json")).toMatchObject({
      icon: { name: "npm" },
      tone: "red",
    });
    expect(glyph("tsconfig.json")).toBe("tsconfig");
    expect(glyph(".gitignore")).toBe("git");
    expect(fileTypeOf(".gitignore").tone).toBe("ignored");
    expect(glyph("yarn.lock")).toBe("yarn");
    expect(fileTypeOf("CLAUDE.md")).toMatchObject({
      label: "Agent instructions",
      preview: "markdown",
    });
  });

  it("matches special names case-insensitively", () => {
    expect(glyph("Makefile")).toBe("makefile");
    expect(glyph("MAKEFILE")).toBe("makefile");
    expect(glyph("Gemfile")).toBe("ruby");
  });

  it("matches name families by prefix", () => {
    expect(glyph("Dockerfile")).toBe("docker");
    expect(glyph("Dockerfile.dev")).toBe("docker");
    expect(glyph("docker-compose.override.yml")).toBe("docker");
    expect(glyph("LICENSE")).toBe("license");
    expect(glyph("LICENSE-MIT")).toBe("license");
    expect(glyph("vite.config.ts")).toBe("vite");
    expect(glyph("tsconfig.build.json")).toBe("tsconfig");
    expect(glyph(".eslintrc.json")).toBe("eslint");
    expect(glyph(".env.local")).toBe("config");
  });

  it("keeps a document family to documents", () => {
    expect(glyph("README.md")).toBe("info");
    expect(fileTypeOf("README.md").preview).toBe("markdown");
    expect(fileTypeOf("README").preview).toBeUndefined();
    expect(glyph("todo.ts")).toBe("typescript");
    expect(glyph("changes.tsx")).toBe("react");
    expect(glyph("readme-generator.py")).toBe("python");
    expect(glyph("CHANGELOG.txt")).toBe("clock");
  });

  it("does not treat a prefix that runs on into a longer word as a match", () => {
    expect(glyph("licensed-fonts.json")).toBe("json");
    expect(glyph("Dockerfiles.md")).toBe("markdown");
  });

  it("reads only the last path segment", () => {
    expect(glyph("/vol/me/project/package.json")).toBe("npm");
    expect(glyph("C:\\work\\Dockerfile")).toBe("docker");
    expect(glyph("src.d/readme.ts.bak")).toBe("default");
  });

  it("treats a leading dot as part of the name, not an extension", () => {
    expect(glyph(".bashrc")).toBe("shell");
    expect(fileTypeOf(".unknownrc")).toEqual({
      icon: { kind: "seti", name: "default" },
      tone: "neutral",
      label: "File",
    });
  });

  it("falls back to the generic glyph and '<EXT> file'", () => {
    expect(fileTypeOf("thing.xyz")).toEqual({
      icon: { kind: "seti", name: "default" },
      tone: "neutral",
      label: "XYZ file",
    });
    expect(fileTypeOf("noext").label).toBe("File");
    expect(fileTypeOf("archive.tar.weird").label).toBe("WEIRD file");
  });

  it("keys every table row in lowercase, so the case-insensitive lookup can reach it", () => {
    const keys = [
      ...Object.keys(BY_EXTENSION),
      ...Object.keys(BY_NAME),
      ...BY_NAME_PREFIX.map((r) => r.prefix),
    ];
    expect(keys.filter((k) => k !== k.toLowerCase())).toEqual([]);
  });

  it("covers the common types (at least 100 extensions)", () => {
    expect(Object.keys(BY_EXTENSION).length).toBeGreaterThanOrEqual(100);
  });
});
