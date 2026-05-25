import type { ConfigRegistration } from "@plugins/config_v2/web";

export interface ConfigTreeGroup {
  id: string;
  label: string;
  children: ConfigTreeGroup[];
  registrations: ConfigRegistration[];
}

interface TreeNode {
  label: string;
  children: Map<string, TreeNode>;
  registrations: ConfigRegistration[];
}

function stripPluginsSegments(segments: string[]): string[] {
  return segments.filter((s) => s !== "plugins");
}

export function buildConfigTree(registrations: ConfigRegistration[]): ConfigTreeGroup[] {
  const root: Map<string, TreeNode> = new Map();

  for (const reg of registrations) {
    const segments = reg.hierarchyPath.split("/");
    const displaySegments = stripPluginsSegments(segments);

    let level = root;
    for (let i = 0; i < displaySegments.length; i++) {
      const seg = displaySegments[i]!;
      if (!level.has(seg)) {
        level.set(seg, { label: seg, children: new Map(), registrations: [] });
      }
      const node = level.get(seg)!;
      if (i === displaySegments.length - 1) {
        node.registrations.push(reg);
      } else {
        level = node.children;
      }
    }
  }

  return convertLevel(root, "");
}

function convertLevel(level: Map<string, TreeNode>, prefix: string): ConfigTreeGroup[] {
  const groups: ConfigTreeGroup[] = [];

  for (const [key, node] of level) {
    const id = prefix ? `${prefix}/${key}` : key;
    const children = convertLevel(node.children, id);

    if (children.length === 0 && node.registrations.length === 1) {
      groups.push({
        id,
        label: node.label,
        children: [],
        registrations: node.registrations,
      });
    } else if (children.length === 1 && node.registrations.length === 0) {
      const child = children[0]!;
      groups.push({
        id: child.id,
        label: `${node.label} / ${child.label}`,
        children: child.children,
        registrations: child.registrations,
      });
    } else {
      groups.push({
        id,
        label: node.label,
        children,
        registrations: node.registrations,
      });
    }
  }

  return groups;
}
