import { expect, test } from "bun:test";
import { detectLanguage } from "./detect-language";

const cases: Array<[string, string]> = [
  [
    "python",
    `import os

def greet(name: str) -> str:
    return f"hi {name}"

class Foo:
    pass`,
  ],
  [
    "ts",
    `interface User { id: number; name: string }
const greet = (u: User): string => \`hi \${u.name}\`;
export const x = greet({ id: 1, name: "a" });`,
  ],
  [
    "tsx",
    `function App() {
  const [n, setN] = useState<number>(0);
  const onClick = (e: MouseEvent): void => setN(n + 1);
  return <button className="b" onClick={onClick}>{n}</button>;
}`,
  ],
  [
    "js",
    `const fs = require("fs");
function main() {
  console.log("hello");
}
main();`,
  ],
  [
    "go",
    `package main

import "fmt"

func main() {
    x := 1
    fmt.Println(x)
}`,
  ],
  [
    "rust",
    `fn main() {
    let mut v: Vec<i32> = Vec::new();
    v.push(1);
    println!("{:?}", v);
}`,
  ],
  ["json", `{ "name": "equin", "version": 1, "tags": ["a", "b"] }`],
  [
    "sql",
    `SELECT id, name FROM users WHERE active = true ORDER BY name;`,
  ],
  [
    "bash",
    `#!/bin/bash
set -euo pipefail
echo "building"
export PATH="$PATH:/usr/local/bin"`,
  ],
  [
    "docker",
    `FROM node:20
WORKDIR /app
COPY . .
RUN bun install
CMD ["bun", "start"]`,
  ],
  [
    "css",
    `.card {
  display: flex;
  color: red;
}
@media (max-width: 600px) { .card { display: block; } }`,
  ],
  [
    "scss",
    `$primary: #333;
.card {
  color: $primary;
  &:hover { color: blue; }
}`,
  ],
  [
    "yaml",
    `name: ci
on: push
jobs:
  build:
    runs-on: ubuntu-latest`,
  ],
  [
    "toml",
    `[package]
name = "equin"
version = "0.1.0"

[dependencies]
serde = "1.0"`,
  ],
  [
    "markdown",
    `# Title

Some intro text.

- one
- two

See [docs](https://example.com).`,
  ],
  [
    "html",
    `<!DOCTYPE html>
<html><body><div class="x">hi</div></body></html>`,
  ],
];

for (const [expected, code] of cases) {
  test(`detects ${expected}`, () => {
    expect(detectLanguage(code)).toBe(expected);
  });
}

test("returns null for too-short input", () => {
  expect(detectLanguage("x")).toBeNull();
});

test("returns null for plain prose", () => {
  expect(
    detectLanguage("This is just a plain sentence with no code in it at all."),
  ).toBeNull();
});
