import { describe, it, expect } from "vitest";
import { COMPLETED_TASK_REGEX, getIndentLevelFromText } from "../utils";

describe("COMPLETED_TASK_REGEX", () => {
  describe("should match completed tasks", () => {
    it("matches dash with lowercase x", () => {
      expect(COMPLETED_TASK_REGEX.test("- [x] completed task")).toBe(true);
    });

    it("matches dash with uppercase X", () => {
      expect(COMPLETED_TASK_REGEX.test("- [X] completed task")).toBe(true);
    });

    it("matches asterisk bullet", () => {
      expect(COMPLETED_TASK_REGEX.test("* [x] completed task")).toBe(true);
    });

    it("matches plus bullet", () => {
      expect(COMPLETED_TASK_REGEX.test("+ [x] completed task")).toBe(true);
    });

    it("matches with leading whitespace (spaces)", () => {
      expect(COMPLETED_TASK_REGEX.test("  - [x] indented task")).toBe(true);
    });

    it("matches with leading whitespace (tabs)", () => {
      expect(COMPLETED_TASK_REGEX.test("\t- [x] indented task")).toBe(true);
    });

    it("matches with mixed leading whitespace", () => {
      expect(COMPLETED_TASK_REGEX.test("  \t- [x] indented task")).toBe(true);
    });
  });

  describe("should NOT match incomplete tasks", () => {
    it("does not match unchecked checkbox", () => {
      expect(COMPLETED_TASK_REGEX.test("- [ ] pending task")).toBe(false);
    });

    it("does not match empty checkbox", () => {
      expect(COMPLETED_TASK_REGEX.test("- [] task")).toBe(false);
    });

    it("does not match checkbox without bullet", () => {
      expect(COMPLETED_TASK_REGEX.test("[x] no bullet")).toBe(false);
    });

    it("does not match bullet without checkbox", () => {
      expect(COMPLETED_TASK_REGEX.test("- regular bullet")).toBe(false);
    });

    it("does not match checkbox without space after bullet", () => {
      expect(COMPLETED_TASK_REGEX.test("-[x] no space")).toBe(false);
    });

    it("does not match numbered list", () => {
      expect(COMPLETED_TASK_REGEX.test("1. [x] numbered")).toBe(false);
    });

    it("does not match regular text with x in brackets", () => {
      expect(COMPLETED_TASK_REGEX.test("some text [x] here")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("matches task with trailing content", () => {
      expect(COMPLETED_TASK_REGEX.test("- [x] task with [[link]] and #tag")).toBe(true);
    });

    it("matches task with emoji", () => {
      expect(COMPLETED_TASK_REGEX.test("- [x] task done ✅")).toBe(true);
    });

    it("does not match partially checked-like patterns", () => {
      expect(COMPLETED_TASK_REGEX.test("- [/] in progress")).toBe(false);
      expect(COMPLETED_TASK_REGEX.test("- [-] cancelled")).toBe(false);
    });
  });
});

describe("getIndentLevelFromText", () => {
  describe("spaces", () => {
    it("returns 0 for no indentation", () => {
      expect(getIndentLevelFromText("no indent")).toBe(0);
    });

    it("returns correct count for spaces", () => {
      expect(getIndentLevelFromText("  two spaces")).toBe(2);
      expect(getIndentLevelFromText("    four spaces")).toBe(4);
      expect(getIndentLevelFromText("        eight spaces")).toBe(8);
    });
  });

  describe("tabs", () => {
    it("counts tabs as 4 spaces", () => {
      expect(getIndentLevelFromText("\tone tab")).toBe(4);
      expect(getIndentLevelFromText("\t\ttwo tabs")).toBe(8);
    });
  });

  describe("mixed indentation", () => {
    it("handles mixed tabs and spaces", () => {
      expect(getIndentLevelFromText("\t  tab plus two spaces")).toBe(6);
      expect(getIndentLevelFromText("  \ttwo spaces plus tab")).toBe(6);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for empty string", () => {
      expect(getIndentLevelFromText("")).toBe(0);
    });

    it("returns correct count for whitespace-only string", () => {
      expect(getIndentLevelFromText("    ")).toBe(4);
    });

    it("handles list markers correctly", () => {
      expect(getIndentLevelFromText("- item")).toBe(0);
      expect(getIndentLevelFromText("  - item")).toBe(2);
      expect(getIndentLevelFromText("\t- item")).toBe(4);
    });
  });
});

describe("sub-bullet hiding logic", () => {
  // These tests document the expected behavior for sub-bullet detection
  // The actual implementation is in buildLineDecorations which requires CodeMirror mocks

  describe("empty line boundary behavior", () => {
    it("documents that empty lines should break nesting", () => {
      // Example document structure:
      // - [x] completed task     <- should be hidden
      //   - sub item             <- should be hidden (if hideSubBullets ON)
      //                          <- empty line BREAKS nesting
      // - [ ] independent task   <- should NOT be hidden

      const lines = [
        "- [x] completed task",
        "  - sub item",
        "",
        "- [ ] independent task",
      ];

      // The empty line at index 2 should stop the sub-bullet search
      // Line at index 3 should NOT be considered nested under the completed task
      expect(lines[2].trim()).toBe("");
      expect(COMPLETED_TASK_REGEX.test(lines[3])).toBe(false); // pending, not completed
    });
  });

  describe("indentation boundary behavior", () => {
    it("documents that equal/lower indentation breaks nesting", () => {
      const lines = [
        "- [x] completed",
        "  - nested under completed",
        "- [ ] same level, different task",
      ];

      const completedIndent = getIndentLevelFromText(lines[0]);
      const nestedIndent = getIndentLevelFromText(lines[1]);
      const sameLevelIndent = getIndentLevelFromText(lines[2]);

      expect(completedIndent).toBe(0);
      expect(nestedIndent).toBe(2);
      expect(sameLevelIndent).toBe(0);

      // nested has greater indent than completed -> should be hidden (if hideSubBullets ON)
      expect(nestedIndent).toBeGreaterThan(completedIndent);

      // same level has equal indent -> should NOT be hidden as nested
      expect(sameLevelIndent).toBeLessThanOrEqual(completedIndent);
    });
  });

  describe("hideSubBullets OFF behavior", () => {
    it("documents that only completed tasks are hidden when setting is OFF", () => {
      const lines = [
        "- [x] completed",       // hidden
        "  - nested",            // visible (hideSubBullets OFF)
        "  - [ ] nested pending", // visible
        "- [ ] independent",     // visible
      ];

      // Only lines matching COMPLETED_TASK_REGEX should be hidden
      expect(COMPLETED_TASK_REGEX.test(lines[0])).toBe(true);  // hidden
      expect(COMPLETED_TASK_REGEX.test(lines[1])).toBe(false); // visible
      expect(COMPLETED_TASK_REGEX.test(lines[2])).toBe(false); // visible
      expect(COMPLETED_TASK_REGEX.test(lines[3])).toBe(false); // visible
    });
  });

  describe("hideSubBullets ON behavior", () => {
    it("documents that nested content is hidden when setting is ON", () => {
      const lines = [
        "- [x] completed",       // hidden
        "  - nested bullet",     // hidden (nested under completed)
        "  - [ ] nested pending", // hidden (nested under completed)
        "  some text",           // hidden (nested under completed)
        "- [ ] independent",     // visible (not nested)
      ];

      const completedIndent = getIndentLevelFromText(lines[0]);

      // All nested items have greater indentation
      expect(getIndentLevelFromText(lines[1])).toBeGreaterThan(completedIndent);
      expect(getIndentLevelFromText(lines[2])).toBeGreaterThan(completedIndent);
      expect(getIndentLevelFromText(lines[3])).toBeGreaterThan(completedIndent);

      // Independent has equal indentation -> boundary
      expect(getIndentLevelFromText(lines[4])).toBeLessThanOrEqual(completedIndent);
    });
  });
});
