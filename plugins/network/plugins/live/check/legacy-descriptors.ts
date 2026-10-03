import type TS from "typescript";

// The pure half of `live:legacy-descriptors-pinned` (A27 of
// research/2026-10-01-global-scoped-change-routing-p5-p8-v2.md). A bare
// `resourceDescriptor(` — live-state's legacy one-payload spelling — is a
// resource the routed runtime can only reload in FULL. After item 7 the only
// ones left are the two page resources (Known limits: pages and page-links stay
// legacy-full until item 9), so every bare call must be the initializer of one
// of those two bindings, and each of the two must still be declared — a pin
// that outlives its declaration would wave the next one through.
//
// Names, not symbols, read off the AST. The spelling is reached three ways: by
// its own name, by any local the file imports it as (`import {
// resourceDescriptor as rd }`), and as a member of any namespace import
// (`import * as ls …; ls.resourceDescriptor(`). Each such reference must be the
// callee of a call; any other value reference (`const rd = resourceDescriptor`,
// passing it along, destructuring it out of a namespace) is reported too, since
// it would let a call escape the pin under a name the scan cannot follow.
// Declaration names (the function's own definition, a barrel's export
// specifier, an object key) and type queries are not references.
// `keyedResourceDescriptor` / `queryResourceDescriptor` are other names (the
// tree's spellings, Item 3), so a name match cannot confuse them. Test code is
// the caller's to exclude.

/** The bindings a bare `resourceDescriptor(` may initialize — the declared legacy-full set. */
export const PINNED_LEGACY_DESCRIPTORS: readonly string[] = [
  "pagesResource",
  "pageLinksResource",
];

const SPELLING = "resourceDescriptor";

export interface Source {
  rel: string;
  src: string;
}

/**
 * One reference to the spelling: a call and the `const` it initializes (if
 * any), or an `escape` — a value reference that is not a call.
 */
export type LegacyDescriptorCall =
  | { kind: "call"; path: string; line: number; binding: string | null }
  | { kind: "escape"; path: string; line: number };

interface LocalNames {
  /** Locals naming the function itself: the spelling and its import aliases. */
  direct: Set<string>;
  /** Locals naming a namespace import (`import * as ns`), whose `.resourceDescriptor` is the spelling. */
  namespaces: Set<string>;
}

function localNames(ts: typeof TS, sf: TS.SourceFile): LocalNames {
  const direct = new Set([SPELLING]);
  const namespaces = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const spec of bindings.elements) {
      const imported = (spec.propertyName ?? spec.name).text;
      if (imported === SPELLING) direct.add(spec.name.text);
    }
  }
  return { direct, namespaces };
}

/** Is this identifier a declaration's NAME (or a key) rather than a value reference? */
function isDeclarationName(ts: typeof TS, id: TS.Identifier): boolean {
  const p = id.parent;
  if (
    ts.isImportSpecifier(p) ||
    ts.isExportSpecifier(p) ||
    ts.isImportClause(p) ||
    ts.isNamespaceImport(p) ||
    ts.isTypeQueryNode(p)
  ) {
    return true;
  }
  if (ts.isQualifiedName(p)) return p.right === id;
  if (ts.isPropertyAccessExpression(p)) return p.name === id;
  if (ts.isBindingElement(p)) return p.propertyName === id;
  return (
    (ts.isFunctionDeclaration(p) ||
      ts.isClassDeclaration(p) ||
      ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isPropertySignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isEnumMember(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isInterfaceDeclaration(p)) &&
    p.name === id
  );
}

/** The `const` a call initializes — through `as` / `satisfies` / parentheses — or null. */
function bindingOf(ts: typeof TS, call: TS.CallExpression): string | null {
  let node: TS.Node = call;
  while (
    ts.isParenthesizedExpression(node.parent) ||
    ts.isAsExpression(node.parent) ||
    ts.isSatisfiesExpression(node.parent)
  ) {
    node = node.parent;
  }
  const decl = node.parent;
  return ts.isVariableDeclaration(decl) &&
    decl.initializer === node &&
    ts.isIdentifier(decl.name)
    ? decl.name.text
    : null;
}

/**
 * Every reference to the spelling (by name, import alias or namespace member)
 * in `sources`: each call with the `const` it initializes, and each value
 * reference that is not a call.
 */
export function findLegacyDescriptorCalls(
  ts: typeof TS,
  sources: readonly Source[],
): LegacyDescriptorCall[] {
  const out: LegacyDescriptorCall[] = [];
  for (const { rel, src } of sources) {
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true);
    const { direct, namespaces } = localNames(ts, sf);
    const lineOf = (node: TS.Node) =>
      sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    /** Record `ref` (a reference to the spelling) as a call or an escape. */
    const record = (ref: TS.Expression): void => {
      const p = ref.parent;
      if (ts.isCallExpression(p) && p.expression === ref) {
        out.push({
          kind: "call",
          path: rel,
          line: lineOf(p),
          binding: bindingOf(ts, p),
        });
      } else {
        out.push({ kind: "escape", path: rel, line: lineOf(ref) });
      }
    };
    const visit = (node: TS.Node): void => {
      if (
        ts.isIdentifier(node) &&
        direct.has(node.text) &&
        !isDeclarationName(ts, node)
      ) {
        record(node);
      } else if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === SPELLING &&
        ts.isIdentifier(node.expression) &&
        namespaces.has(node.expression.text)
      ) {
        record(node);
      } else if (
        ts.isBindingElement(node) &&
        (node.propertyName ?? node.name).getText(sf) === SPELLING
      ) {
        // `const { resourceDescriptor: rd } = ns` — the spelling taken out of an object.
        out.push({ kind: "escape", path: rel, line: lineOf(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** What breaks the pin, as `path:line — reason` lines (empty when it holds). */
export function legacyDescriptorViolations(
  calls: readonly LegacyDescriptorCall[],
  pinned: readonly string[] = PINNED_LEGACY_DESCRIPTORS,
): string[] {
  const out: string[] = [];
  const declared = new Map<string, number>();
  for (const call of calls) {
    if (call.kind === "escape") {
      out.push(
        `${call.path}:${call.line} — resourceDescriptor referenced without being called: an alias or a passed-along reference escapes the pin`,
      );
    } else if (call.binding === null) {
      out.push(
        `${call.path}:${call.line} — a resourceDescriptor(…) call no \`const\` binds`,
      );
    } else if (!pinned.includes(call.binding)) {
      out.push(
        `${call.path}:${call.line} — ${call.binding}: a new legacy resourceDescriptor`,
      );
    } else {
      declared.set(call.binding, (declared.get(call.binding) ?? 0) + 1);
    }
  }
  for (const name of pinned) {
    const n = declared.get(name) ?? 0;
    if (n === 0) {
      out.push(
        `${name} — pinned, but no resourceDescriptor(…) declares it any more: remove it from PINNED_LEGACY_DESCRIPTORS`,
      );
    } else if (n > 1) {
      out.push(`${name} — declared by ${n} resourceDescriptor(…) calls`);
    }
  }
  return out;
}
