import { seti, type SetiRef } from "@plugins/ui/plugins/icons/core";
import type { FileTone } from "./tones";

/**
 * How a file of this type is best previewed — a HINT for a viewer registry,
 * which still decides from the bytes (a `.txt` that is binary is not text).
 */
export type FilePreview =
  "markdown" | "code" | "text" | "csv" | "image" | "pdf" | "video" | "audio";

/** What a file is: the glyph it draws, the tone it is tinted in, what to call it. */
export interface FileType {
  readonly icon: SetiRef;
  readonly tone: FileTone;
  /** A human name for the type: `TypeScript`, `PNG image`, `Dockerfile`. */
  readonly label: string;
  readonly preview?: FilePreview;
}

function type(
  icon: SetiRef,
  tone: FileTone,
  label: string,
  preview?: FilePreview,
): FileType {
  return preview === undefined
    ? { icon, tone, label }
    : { icon, tone, label, preview };
}

// The glyphs and tones follow Seti's own mapping (jesseweed/seti-ui
// `styles/components/icons/mapping.less`, the table VS Code's Seti theme is
// built from), extended with common types it has no row for.

// ── Shared rows ─────────────────────────────────────────────────────────────
const TYPESCRIPT = type(seti("typescript"), "blue", "TypeScript", "code");
const TS_TEST = type(seti("typescript"), "orange", "TypeScript test", "code");
const JAVASCRIPT = type(seti("javascript"), "yellow", "JavaScript", "code");
const JS_TEST = type(seti("javascript"), "orange", "JavaScript test", "code");
const REACT = type(seti("react"), "blue", "React component", "code");
const REACT_TEST = type(seti("react"), "orange", "React test", "code");
const JSON_FILE = type(seti("json"), "yellow", "JSON", "code");
const YAML = type(seti("yml"), "purple", "YAML", "code");
const MARKDOWN = type(seti("markdown"), "blue", "Markdown", "markdown");
const PLAIN_TEXT = type(seti("default"), "neutral", "Plain text", "text");
const CONFIG = type(seti("config"), "grey", "Configuration", "code");
const ENV = type(seti("config"), "grey", "Environment file", "code");
const SHELL = type(seti("shell"), "green", "Shell script", "code");
const C_HEADER = type(seti("c"), "purple", "C header", "code");
const CPP = type(seti("cpp"), "blue", "C++", "code");
const CPP_HEADER = type(seti("cpp"), "purple", "C++ header", "code");
const HTML = type(seti("html"), "orange", "HTML", "code");
const SASS = type(seti("sass"), "pink", "Sass", "code");
const GRAPHQL = type(seti("graphql"), "pink", "GraphQL", "code");
const PYTHON = type(seti("python"), "blue", "Python", "code");
const RUBY = type(seti("ruby"), "red", "Ruby", "code");
const RUST = type(seti("rust"), "grey", "Rust", "code");
const GO = type(seti("go2"), "blue", "Go", "code");
const KOTLIN = type(seti("kotlin"), "orange", "Kotlin", "code");
const HASKELL = type(seti("haskell"), "purple", "Haskell", "code");
const CLOJURE = type(seti("clojure"), "green", "Clojure", "code");
const OCAML = type(seti("ocaml"), "orange", "OCaml", "code");
const ELIXIR = type(seti("elixir"), "purple", "Elixir", "code");
const POWERSHELL = type(seti("powershell"), "blue", "PowerShell", "code");
const WINDOWS_BATCH = type(seti("windows"), "blue", "Batch file", "code");
const TERRAFORM = type(seti("terraform"), "purple", "Terraform", "code");
const R_LANG = type(seti("R"), "blue", "R", "code");
const HANDLEBARS = type(seti("mustache"), "orange", "Handlebars", "code");
const NUNJUCKS = type(seti("nunjucks"), "green", "Nunjucks", "code");
const JINJA = type(seti("jinja"), "red", "Jinja", "code");
const ERB = type(seti("html_erb"), "red", "ERB template", "code");
const TEX = type(seti("tex"), "blue", "TeX", "code");
const CSV = type(seti("csv"), "green", "CSV", "csv");
const TSV = type(seti("csv"), "green", "TSV", "csv");
const SPREADSHEET = type(seti("xls"), "green", "Spreadsheet");
const WORD = type(seti("word"), "blue", "Word document");
const FONT = type(seti("font"), "red", "Font");
const ARCHIVE = type(seti("zip"), "grey", "Archive");
const CERTIFICATE = type(seti("lock"), "green", "Certificate or key");
const MODEL_3D = type(seti("svg"), "blue", "3D model");
const DATABASE = type(seti("db"), "pink", "Database");
const VIDEO = type(seti("video"), "pink", "Video", "video");
const AUDIO = type(seti("audio"), "purple", "Audio", "audio");
const LOG = type(seti("default"), "grey", "Log", "text");

function image(label: string): FileType {
  return type(seti("image"), "purple", label, "image");
}

/**
 * By extension, lowercase, without the leading dot. A compound extension
 * (`test.ts`, `d.ts`) beats the plain one — the resolver tries the longest
 * suffix first.
 */
export const BY_EXTENSION: Readonly<Record<string, FileType>> = {
  // TypeScript / JavaScript
  ts: TYPESCRIPT,
  mts: TYPESCRIPT,
  cts: TYPESCRIPT,
  "d.ts": type(seti("typescript"), "blue", "TypeScript declarations", "code"),
  "test.ts": TS_TEST,
  "spec.ts": TS_TEST,
  tsx: REACT,
  jsx: REACT,
  cjsx: REACT,
  "test.tsx": REACT_TEST,
  "spec.tsx": REACT_TEST,
  "test.jsx": REACT_TEST,
  "spec.jsx": REACT_TEST,
  js: JAVASCRIPT,
  mjs: JAVASCRIPT,
  cjs: JAVASCRIPT,
  es6: JAVASCRIPT,
  "test.js": JS_TEST,
  "spec.js": JS_TEST,
  "test.mjs": JS_TEST,
  "test.cjs": JS_TEST,
  "js.map": type(seti("javascript"), "yellow", "Source map", "code"),
  coffee: type(seti("coffee"), "yellow", "CoffeeScript", "code"),
  ls: type(seti("livescript"), "blue", "LiveScript", "code"),
  wasm: type(seti("wasm"), "purple", "WebAssembly"),
  wat: type(seti("wat"), "purple", "WebAssembly text", "code"),

  // Data and config
  json: JSON_FILE,
  jsonc: type(seti("json"), "yellow", "JSON with comments", "code"),
  json5: type(seti("json"), "yellow", "JSON5", "code"),
  jsonl: type(seti("json"), "yellow", "JSON Lines", "code"),
  ndjson: type(seti("json"), "yellow", "JSON Lines", "code"),
  cson: type(seti("json"), "yellow", "CSON", "code"),
  yml: YAML,
  yaml: YAML,
  toml: type(seti("config"), "grey", "TOML", "code"),
  ini: type(seti("config"), "grey", "INI", "code"),
  cfg: CONFIG,
  conf: CONFIG,
  config: CONFIG,
  properties: type(seti("java"), "red", "Java properties", "code"),
  env: ENV,
  xml: type(seti("xml"), "orange", "XML", "code"),
  plist: type(seti("xml"), "orange", "Property list", "code"),
  csv: CSV,
  tsv: TSV,
  sql: type(seti("db"), "pink", "SQL", "code"),
  db: DATABASE,
  sqlite: DATABASE,
  sqlite3: DATABASE,
  prisma: type(seti("prisma"), "blue", "Prisma schema", "code"),
  graphql: GRAPHQL,
  gql: GRAPHQL,
  graphqls: GRAPHQL,
  ipynb: type(seti("notebook"), "blue", "Jupyter notebook", "code"),
  lock: type(seti("lock"), "grey", "Lockfile", "text"),
  tmp: type(seti("clock"), "grey", "Temporary file"),

  // Documents
  md: MARKDOWN,
  markdown: MARKDOWN,
  mdx: type(seti("markdown"), "blue", "MDX", "markdown"),
  txt: PLAIN_TEXT,
  text: PLAIN_TEXT,
  rst: type(seti("default"), "neutral", "reStructuredText", "text"),
  log: LOG,
  pdf: type(seti("pdf"), "red", "PDF document", "pdf"),
  doc: WORD,
  docx: WORD,
  xls: SPREADSHEET,
  xlsx: SPREADSHEET,
  tex: TEX,
  sty: type(seti("tex"), "yellow", "TeX style", "code"),
  bib: type(seti("tex"), "blue", "BibTeX", "code"),

  // Web
  html: HTML,
  htm: HTML,
  css: type(seti("css"), "blue", "CSS", "code"),
  "css.map": type(seti("css"), "blue", "Source map", "code"),
  scss: SASS,
  sass: SASS,
  less: type(seti("less"), "blue", "Less", "code"),
  styl: type(seti("stylus"), "green", "Stylus", "code"),
  vue: type(seti("vue"), "green", "Vue component", "code"),
  svelte: type(seti("svelte"), "red", "Svelte component", "code"),
  ejs: type(seti("ejs"), "yellow", "EJS template", "code"),
  hbs: HANDLEBARS,
  handlebars: HANDLEBARS,
  mustache: type(seti("mustache"), "orange", "Mustache template", "code"),
  pug: type(seti("pug"), "red", "Pug template", "code"),
  jade: type(seti("jade"), "red", "Jade template", "code"),
  haml: type(seti("haml"), "red", "Haml template", "code"),
  slim: type(seti("slim"), "orange", "Slim template", "code"),
  njk: NUNJUCKS,
  nunjucks: NUNJUCKS,
  twig: type(seti("twig"), "green", "Twig template", "code"),
  liquid: type(seti("liquid"), "green", "Liquid template", "code"),
  jinja: JINJA,
  jinja2: JINJA,
  j2: JINJA,
  erb: ERB,
  "html.erb": ERB,

  // Languages
  py: PYTHON,
  pyi: type(seti("python"), "blue", "Python stub", "code"),
  pyw: PYTHON,
  rb: RUBY,
  rake: RUBY,
  gemspec: RUBY,
  rs: RUST,
  go: GO,
  java: type(seti("java"), "red", "Java", "code"),
  class: type(seti("java"), "blue", "Java class"),
  jar: type(seti("zip"), "red", "Java archive"),
  kt: KOTLIN,
  kts: KOTLIN,
  scala: type(seti("scala"), "red", "Scala", "code"),
  sbt: type(seti("sbt"), "blue", "sbt build", "code"),
  groovy: type(seti("grails"), "green", "Groovy", "code"),
  gradle: type(seti("gradle"), "blue", "Gradle build", "code"),
  swift: type(seti("swift"), "orange", "Swift", "code"),
  c: type(seti("c"), "blue", "C", "code"),
  h: C_HEADER,
  m: type(seti("c"), "yellow", "Objective-C", "code"),
  mm: type(seti("cpp"), "yellow", "Objective-C++", "code"),
  cc: CPP,
  cpp: CPP,
  cxx: CPP,
  hh: CPP_HEADER,
  hpp: CPP_HEADER,
  hxx: CPP_HEADER,
  cu: type(seti("cu"), "green", "CUDA", "code"),
  cuh: type(seti("cu"), "purple", "CUDA header", "code"),
  cs: type(seti("c-sharp"), "blue", "C#", "code"),
  fs: type(seti("f-sharp"), "blue", "F#", "code"),
  fsx: type(seti("f-sharp"), "blue", "F# script", "code"),
  php: type(seti("php"), "purple", "PHP", "code"),
  pl: type(seti("perl"), "blue", "Perl", "code"),
  lua: type(seti("lua"), "blue", "Lua", "code"),
  r: R_LANG,
  rmd: R_LANG,
  jl: type(seti("julia"), "purple", "Julia", "code"),
  dart: type(seti("dart"), "blue", "Dart", "code"),
  ex: ELIXIR,
  exs: type(seti("elixir_script"), "purple", "Elixir script", "code"),
  hs: HASKELL,
  lhs: HASKELL,
  elm: type(seti("elm"), "blue", "Elm", "code"),
  clj: CLOJURE,
  cljs: CLOJURE,
  cljc: CLOJURE,
  edn: type(seti("clojure"), "blue", "EDN", "code"),
  ml: OCAML,
  mli: OCAML,
  re: type(seti("reasonml"), "red", "Reason", "code"),
  res: type(seti("rescript"), "red", "ReScript", "code"),
  purs: type(seti("purescript"), "neutral", "PureScript", "code"),
  nim: type(seti("nim"), "yellow", "Nim", "code"),
  zig: type(seti("zig"), "orange", "Zig", "code"),
  d: type(seti("d"), "red", "D", "code"),
  cr: type(seti("crystal"), "neutral", "Crystal", "code"),
  vala: type(seti("vala"), "grey", "Vala", "code"),
  hx: type(seti("haxe"), "orange", "Haxe", "code"),
  hack: type(seti("hacklang"), "orange", "Hack", "code"),
  sol: type(seti("ethereum"), "blue", "Solidity", "code"),
  asm: type(seti("asm"), "red", "Assembly", "code"),
  s: type(seti("asm"), "red", "Assembly", "code"),
  bicep: type(seti("bicep"), "blue", "Bicep", "code"),
  tf: TERRAFORM,
  tfvars: TERRAFORM,
  "tf.json": TERRAFORM,
  gd: type(seti("godot"), "blue", "GDScript", "code"),
  bzl: type(seti("bazel"), "green", "Bazel", "code"),
  bazel: type(seti("bazel"), "green", "Bazel", "code"),
  pp: type(seti("puppet"), "yellow", "Puppet", "code"),
  apex: type(seti("salesforce"), "blue", "Apex", "code"),
  cls: type(seti("salesforce"), "blue", "Apex class", "code"),
  pro: type(seti("prolog"), "orange", "Prolog", "code"),

  // Shell
  sh: SHELL,
  bash: SHELL,
  zsh: SHELL,
  fish: SHELL,
  ps1: POWERSHELL,
  psm1: POWERSHELL,
  psd1: POWERSHELL,
  bat: WINDOWS_BATCH,
  cmd: WINDOWS_BATCH,
  mk: type(seti("makefile"), "orange", "Makefile", "code"),

  // Images
  png: image("PNG image"),
  jpg: image("JPEG image"),
  jpeg: image("JPEG image"),
  gif: image("GIF image"),
  webp: image("WebP image"),
  avif: image("AVIF image"),
  bmp: image("Bitmap image"),
  tif: image("TIFF image"),
  tiff: image("TIFF image"),
  heic: image("HEIC image"),
  svg: type(seti("svg"), "purple", "SVG image", "image"),
  ico: type(seti("favicon"), "yellow", "Icon", "image"),
  psd: type(seti("photoshop"), "blue", "Photoshop document"),
  ai: type(seti("illustrator"), "yellow", "Illustrator document"),

  // Media
  mp4: VIDEO,
  mov: VIDEO,
  webm: VIDEO,
  m4v: VIDEO,
  mkv: VIDEO,
  avi: VIDEO,
  ogv: VIDEO,
  mpg: VIDEO,
  mp3: AUDIO,
  wav: AUDIO,
  flac: AUDIO,
  ogg: AUDIO,
  m4a: AUDIO,
  aac: AUDIO,
  opus: AUDIO,
  mid: AUDIO,
  midi: AUDIO,

  // Fonts, archives, keys, 3D
  ttf: FONT,
  otf: FONT,
  woff: FONT,
  woff2: FONT,
  eot: FONT,
  zip: ARCHIVE,
  tar: ARCHIVE,
  gz: ARCHIVE,
  tgz: ARCHIVE,
  bz2: ARCHIVE,
  xz: ARCHIVE,
  "7z": ARCHIVE,
  rar: ARCHIVE,
  zst: ARCHIVE,
  pem: CERTIFICATE,
  key: CERTIFICATE,
  crt: CERTIFICATE,
  cer: CERTIFICATE,
  cert: CERTIFICATE,
  pub: CERTIFICATE,
  stl: MODEL_3D,
  obj: MODEL_3D,
  "3ds": MODEL_3D,
  dae: MODEL_3D,

  // Editors
  "sublime-project": type(seti("sublime"), "orange", "Sublime project", "code"),
  "sublime-workspace": type(seti("sublime"), "orange", "Sublime workspace"),
  "code-workspace": type(seti("json"), "blue", "VS Code workspace", "code"),
};

const GIT = type(seti("git"), "ignored", "Git configuration", "text");
const README = type(seti("info"), "blue", "Readme");
const CHANGELOG = type(seti("clock"), "blue", "Changelog");
const LICENSE = type(seti("license"), "yellow", "License");
const DOCKERFILE = type(seti("docker"), "blue", "Dockerfile", "code");
const COMPOSE = type(seti("docker"), "pink", "Docker Compose", "code");
const MAKEFILE = type(seti("makefile"), "orange", "Makefile", "code");
const NPM = type(seti("npm"), "red", "npm configuration", "code");
const ESLINT = type(seti("eslint"), "purple", "ESLint configuration", "code");
const STYLELINT = type(
  seti("stylelint"),
  "neutral",
  "Stylelint configuration",
  "code",
);
const BABEL = type(seti("babel"), "yellow", "Babel configuration", "code");
const AGENT_INSTRUCTIONS = type(
  seti("markdown"),
  "orange",
  "Agent instructions",
  "markdown",
);
const TSCONFIG = type(
  seti("tsconfig"),
  "blue",
  "TypeScript configuration",
  "code",
);
const BAZEL = type(seti("bazel"), "green", "Bazel build", "code");
const IGNORE_FILE = type(seti("config"), "grey", "Ignore file", "text");
const PRETTIER = type(seti("config"), "grey", "Prettier configuration", "code");

/**
 * By whole file name, lowercase. Beats the extension: `package.json` is an npm
 * manifest before it is JSON. A row without a `preview` takes its extension's
 * (`README.md` previews as Markdown, a bare `README` as nothing in particular).
 */
export const BY_NAME: Readonly<Record<string, FileType>> = {
  "package.json": type(seti("npm"), "red", "npm package", "code"),
  "package-lock.json": type(seti("npm"), "red", "npm lockfile", "code"),
  "npm-shrinkwrap.json": type(seti("npm"), "red", "npm lockfile", "code"),
  ".npmrc": NPM,
  ".npmignore": NPM,
  "npm-debug.log": type(
    seti("npm_ignored"),
    "ignored",
    "npm debug log",
    "text",
  ),
  "yarn.lock": type(seti("yarn"), "blue", "Yarn lockfile", "text"),
  ".yarnrc": type(seti("yarn"), "blue", "Yarn configuration", "code"),
  ".yarnrc.yml": type(seti("yarn"), "blue", "Yarn configuration", "code"),
  "bun.lock": type(seti("lock"), "grey", "Bun lockfile", "text"),
  "bun.lockb": type(seti("lock"), "grey", "Bun lockfile"),
  "pnpm-lock.yaml": type(seti("lock"), "grey", "pnpm lockfile", "code"),
  "bower.json": type(seti("bower"), "orange", "Bower package", "code"),
  ".bowerrc": type(seti("bower"), "orange", "Bower configuration", "code"),
  "tsconfig.json": TSCONFIG,
  "jsconfig.json": TSCONFIG,
  ".gitignore": GIT,
  ".gitattributes": GIT,
  ".gitmodules": GIT,
  ".gitkeep": GIT,
  ".gitconfig": GIT,
  ".git-blame-ignore-revs": GIT,
  commit_editmsg: GIT,
  merge_msg: GIT,
  ".gitlab-ci.yml": type(seti("gitlab"), "orange", "GitLab CI", "code"),
  ".dockerignore": type(seti("docker"), "grey", "Docker ignore file", "text"),
  ".editorconfig": type(seti("editorconfig"), "grey", "EditorConfig", "code"),
  ".ds_store": type(seti("ignored"), "ignored", "Finder metadata"),
  ".env": ENV,
  ".envrc": ENV,
  ".direnv": ENV,
  ".nvmrc": type(seti("config"), "grey", "Node version", "text"),
  ".node-version": type(seti("config"), "grey", "Node version", "text"),
  ".tool-versions": type(seti("config"), "grey", "Tool versions", "text"),
  ".htaccess": type(seti("config"), "grey", "Apache configuration", "code"),
  "mime.types": CONFIG,
  ".prettierrc": PRETTIER,
  ".prettierignore": IGNORE_FILE,
  ".eslintignore": type(seti("eslint"), "grey", "ESLint ignore file", "text"),
  ".stylelintignore": type(
    seti("stylelint"),
    "grey",
    "Stylelint ignore file",
    "text",
  ),
  ".babelrc": BABEL,
  ".jshintrc": type(seti("javascript"), "blue", "JSHint configuration", "code"),
  ".firebaserc": type(
    seti("firebase"),
    "orange",
    "Firebase configuration",
    "code",
  ),
  "firebase.json": type(
    seti("firebase"),
    "orange",
    "Firebase configuration",
    "code",
  ),
  ".codeclimate.yml": type(
    seti("code-climate"),
    "green",
    "Code Climate configuration",
    "code",
  ),
  "ionic.config.json": type(
    seti("ionic"),
    "blue",
    "Ionic configuration",
    "code",
  ),
  "platformio.ini": type(
    seti("platformio"),
    "orange",
    "PlatformIO project",
    "code",
  ),
  "swagger.json": type(seti("json"), "green", "Swagger definition", "code"),
  "swagger.yml": type(seti("json"), "green", "Swagger definition", "code"),
  "swagger.yaml": type(seti("json"), "green", "Swagger definition", "code"),
  "sass-lint.yml": type(
    seti("sass"),
    "pink",
    "Sass Lint configuration",
    "code",
  ),
  "pom.xml": type(seti("maven"), "red", "Maven project", "code"),
  mvnw: type(seti("maven"), "red", "Maven wrapper", "code"),
  "build.gradle": type(seti("gradle"), "blue", "Gradle build", "code"),
  "settings.gradle": type(seti("gradle"), "blue", "Gradle settings", "code"),
  "cargo.toml": type(seti("rust"), "grey", "Cargo manifest", "code"),
  "cargo.lock": type(seti("rust"), "grey", "Cargo lockfile", "code"),
  "go.mod": type(seti("go2"), "blue", "Go module", "code"),
  "go.sum": type(seti("go2"), "blue", "Go checksums", "text"),
  gemfile: type(seti("ruby"), "red", "Gemfile", "code"),
  "gemfile.lock": type(seti("ruby"), "red", "Gemfile lock", "text"),
  rakefile: type(seti("ruby"), "red", "Rakefile", "code"),
  "requirements.txt": type(
    seti("python"),
    "blue",
    "Python requirements",
    "text",
  ),
  "pyproject.toml": type(seti("python"), "blue", "Python project", "code"),
  "uv.lock": type(seti("python"), "blue", "uv lockfile", "code"),
  pipfile: type(seti("python"), "blue", "Pipfile", "code"),
  "pipfile.lock": type(seti("python"), "blue", "Pipfile lock", "code"),
  makefile: MAKEFILE,
  gnumakefile: MAKEFILE,
  qmakefile: type(seti("makefile"), "purple", "QMake file", "code"),
  omakefile: type(seti("makefile"), "grey", "OMake file", "code"),
  "cmakelists.txt": type(seti("makefile"), "blue", "CMake project", "code"),
  procfile: type(seti("heroku"), "purple", "Procfile", "code"),
  jenkinsfile: type(seti("jenkins"), "red", "Jenkinsfile", "code"),
  build: BAZEL,
  "build.bazel": BAZEL,
  workspace: BAZEL,
  "workspace.bazel": BAZEL,
  ".bazelrc": type(seti("bazel"), "grey", "Bazel configuration", "code"),
  ".bazelversion": type(seti("bazel"), "green", "Bazel version", "text"),
  "claude.md": AGENT_INSTRUCTIONS,
  "agents.md": AGENT_INSTRUCTIONS,
  ".bashrc": SHELL,
  ".zshrc": SHELL,
  ".bash_profile": SHELL,
  ".zprofile": SHELL,
  ".profile": SHELL,
  geckodriver: type(seti("firefox"), "orange", "geckodriver"),
  "compose.yml": COMPOSE,
  "compose.yaml": COMPOSE,
  "history.md": CHANGELOG,
};

/** A family of names that vary after a fixed start. */
export interface NamePrefixRow {
  /** Lowercase. */
  readonly prefix: string;
  readonly type: FileType;
  /**
   * Only a DOCUMENT of that name: no extension (`LICENSE-MIT`) or a text one
   * (`README.md`, `TODO.txt`) — so `todo.ts` stays TypeScript.
   */
  readonly docOnly?: true;
}

/**
 * By file-name PREFIX, checked after {@link BY_NAME} and before the
 * extension: the families a name varies within (`Dockerfile.dev`,
 * `LICENSE-MIT`, `vite.config.ts`). A prefix matches when the name equals it
 * or continues with `.`, `-` or `_` (a prefix ending in `.` already says so);
 * first match wins.
 */
export const BY_NAME_PREFIX: readonly NamePrefixRow[] = [
  { prefix: "dockerfile", type: DOCKERFILE },
  { prefix: "docker-compose", type: COMPOSE },
  { prefix: "readme", type: README, docOnly: true },
  { prefix: "changelog", type: CHANGELOG, docOnly: true },
  { prefix: "changes", type: CHANGELOG, docOnly: true },
  { prefix: "license", type: LICENSE, docOnly: true },
  { prefix: "licence", type: LICENSE, docOnly: true },
  { prefix: "copying", type: LICENSE, docOnly: true },
  {
    prefix: "contributing",
    type: type(seti("license"), "red", "Contributing guide"),
    docOnly: true,
  },
  {
    prefix: "todo",
    type: type(seti("todo"), "blue", "To-do list"),
    docOnly: true,
  },
  { prefix: "tsconfig.", type: TSCONFIG },
  { prefix: ".env.", type: ENV },
  { prefix: ".eslintrc", type: ESLINT },
  { prefix: "eslint.config.", type: ESLINT },
  { prefix: ".stylelintrc", type: STYLELINT },
  { prefix: "stylelint.config.", type: STYLELINT },
  { prefix: ".babelrc", type: BABEL },
  { prefix: "babel.config.", type: BABEL },
  { prefix: ".prettierrc", type: PRETTIER },
  { prefix: "prettier.config.", type: PRETTIER },
  {
    prefix: "vite.config.",
    type: type(seti("vite"), "yellow", "Vite configuration", "code"),
  },
  {
    prefix: "vitest.config.",
    type: type(seti("vite"), "green", "Vitest configuration", "code"),
  },
  {
    prefix: "webpack.",
    type: type(seti("webpack"), "blue", "webpack configuration", "code"),
  },
  {
    prefix: "rollup.config.",
    type: type(seti("rollup"), "red", "Rollup configuration", "code"),
  },
  {
    prefix: "karma.conf.",
    type: type(seti("karma"), "green", "Karma configuration", "code"),
  },
  {
    prefix: "gruntfile",
    type: type(seti("grunt"), "orange", "Gruntfile", "code"),
  },
  { prefix: "gulpfile", type: type(seti("gulp"), "red", "Gulpfile", "code") },
];

/** The extensions a {@link NamePrefixRow.docOnly} family may carry. */
export const DOC_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "text",
  "rst",
  "adoc",
  "org",
]);

/** What a file with no row is: Seti's plain-page glyph. */
export const GENERIC_ICON: SetiRef = seti("default");
