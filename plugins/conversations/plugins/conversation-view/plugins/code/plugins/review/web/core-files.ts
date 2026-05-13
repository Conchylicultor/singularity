import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import type { ReviewSection } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/review/shared";

export type FileWarningLevel = "safe" | "careful" | "critical";

export function getFileWarningLevel(
  path: string,
  safePaths: string[],
  carefulPaths: string[],
): FileWarningLevel {
  if (safePaths.some((prefix) => path.startsWith(prefix))) return "safe";
  if (carefulPaths.some((prefix) => path.startsWith(prefix))) return "careful";
  return "critical";
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.startsWith("**/")) return path.endsWith(pattern.slice(3));
  return path.startsWith(pattern);
}

function classifyFile(
  path: string,
  sections: ReviewSection[],
): string | null {
  for (const section of sections) {
    if (section.patterns.some((p) => matchesPattern(path, p))) {
      return section.id;
    }
  }
  return null;
}

export interface FileSection {
  id: string | null;
  name: string | null;
  files: EditedFile[];
}

export function groupBySection(
  files: EditedFile[],
  sections: ReviewSection[],
): FileSection[] {
  const defaultBucket: EditedFile[] = [];
  const namedBuckets = new Map<string, EditedFile[]>();

  for (const s of sections) {
    namedBuckets.set(s.id, []);
  }

  for (const file of files) {
    const sectionId = classifyFile(file.path, sections);
    if (sectionId === null) {
      defaultBucket.push(file);
    } else {
      namedBuckets.get(sectionId)!.push(file);
    }
  }

  const result: FileSection[] = [];
  if (defaultBucket.length > 0 || sections.length === 0) {
    result.push({ id: null, name: null, files: defaultBucket });
  }
  for (const s of sections) {
    const bucket = namedBuckets.get(s.id)!;
    if (bucket.length > 0) {
      result.push({ id: s.id, name: s.name, files: bucket });
    }
  }
  return result;
}
