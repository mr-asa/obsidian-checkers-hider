/**
 * Utility functions for task hiding logic
 * Separated for testability
 */

/**
 * Regex to match completed task lines
 */
export const COMPLETED_TASK_REGEX = /^(\s*[-*+])\s+\[(x|X)\]/;

/**
 * Get indentation level from line text (count leading spaces/tabs)
 */
export function getIndentLevelFromText(text: string): number {
  const match = text.match(/^(\s*)/);
  if (!match) return 0;

  const whitespace = match[1];
  // Count tabs as 4 spaces
  return whitespace.replace(/\t/g, "    ").length;
}
