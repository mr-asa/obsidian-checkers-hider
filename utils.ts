/**
 * Utility functions for task hiding logic.
 * Kept separate so marker matching and page override behavior can be tested
 * without loading Obsidian or CodeMirror.
 */

export type TaskMarkerMode = "hide-listed" | "keep-listed";

export interface TaskMarkerSettings {
  mode: TaskMarkerMode;
  taskMarkers: string[];
}

export interface HiddenLineSettings extends TaskMarkerSettings {
  hiddenState: boolean;
  hideSubBullets: boolean;
}

export interface TagCacheLike {
  tag: string;
}

export interface MetadataCacheLike {
  tags?: TagCacheLike[];
  frontmatter?: {
    tags?: string | string[];
    tag?: string | string[];
  };
}

export const DEFAULT_TASK_MARKERS = ["x", "X"];

/**
 * Regex to match Markdown task lines and capture the checkbox marker.
 */
export const TASK_LINE_REGEX = /^(\s*[-*+])\s+\[([^\]]*)\]/;

/**
 * Backwards-compatible regex for the original completed task behavior.
 */
export const COMPLETED_TASK_REGEX = /^(\s*[-*+])\s+\[(x|X)\]/;

export function parseListSetting(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeTaskMarkers(markers: string[]): string[] {
  const result: string[] = [];

  for (const marker of markers) {
    const trimmed = marker.trim();
    if (trimmed === "" || result.includes(trimmed)) {
      continue;
    }
    result.push(trimmed);
  }

  return result.length > 0 ? result : DEFAULT_TASK_MARKERS;
}

export function getTaskMarkerFromText(text: string): string | null {
  const match = text.match(TASK_LINE_REGEX);
  return match ? match[2] : null;
}

export function shouldHideTaskMarker(
  marker: string | null,
  settings: TaskMarkerSettings,
): boolean {
  if (marker === null || marker === " ") {
    return false;
  }

  const normalizedMarkers = normalizeTaskMarkers(settings.taskMarkers);

  if (settings.mode === "keep-listed") {
    return !normalizedMarkers.includes(marker);
  }

  return normalizedMarkers.includes(marker);
}

/**
 * Get indentation level from line text (count leading spaces/tabs).
 */
export function getIndentLevelFromText(text: string): number {
  const match = text.match(/^(\s*)/);
  if (!match) return 0;

  const whitespace = match[1];
  return whitespace.replace(/\t/g, "    ").length;
}

export function getHiddenLineNumbers(
  lines: string[],
  settings: HiddenLineSettings,
): Set<number> {
  const linesToHide = new Set<number>();

  if (!settings.hiddenState) {
    return linesToHide;
  }

  for (let index = 0; index < lines.length; index++) {
    const lineText = lines[index];
    const taskMarker = getTaskMarkerFromText(lineText);

    if (!shouldHideTaskMarker(taskMarker, settings)) {
      continue;
    }

    linesToHide.add(index + 1);

    if (!settings.hideSubBullets) {
      continue;
    }

    const taskIndent = getIndentLevelFromText(lineText);

    for (let subIndex = index + 1; subIndex < lines.length; subIndex++) {
      const subLineText = lines[subIndex];

      if (subLineText.trim() === "") {
        break;
      }

      const subIndent = getIndentLevelFromText(subLineText);

      if (subIndent <= taskIndent) {
        break;
      }

      linesToHide.add(subIndex + 1);
    }
  }

  return linesToHide;
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

export function collectFrontmatterTags(tags: string | string[] | undefined): string[] {
  if (!tags) {
    return [];
  }

  if (Array.isArray(tags)) {
    const result: string[] = [];
    for (const tag of tags) {
      result.push(...parseListSetting(tag));
    }
    return result;
  }

  return parseListSetting(tags);
}

export function shouldDisableHidingForMetadata(
  metadata: MetadataCacheLike | null | undefined,
  disableHidingTags: string[],
): boolean {
  const normalizedDisableTags = disableHidingTags
    .map(normalizeTag)
    .filter(Boolean);

  if (!metadata || normalizedDisableTags.length === 0) {
    return false;
  }

  const pageTags = new Set<string>();

  for (const tag of metadata.tags || []) {
    pageTags.add(normalizeTag(tag.tag));
  }

  for (const tag of collectFrontmatterTags(metadata.frontmatter?.tags)) {
    pageTags.add(normalizeTag(tag));
  }

  for (const tag of collectFrontmatterTags(metadata.frontmatter?.tag)) {
    pageTags.add(normalizeTag(tag));
  }

  return normalizedDisableTags.some((tag) => pageTags.has(tag));
}
