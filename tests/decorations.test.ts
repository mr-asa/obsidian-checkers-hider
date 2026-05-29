import { describe, expect, it } from "vitest";
import {
  COMPLETED_TASK_REGEX,
  collectFrontmatterTags,
  getHiddenLineNumbers,
  getIndentLevelFromText,
  getTaskMarkerFromText,
  normalizeTaskMarkers,
  parseListSetting,
  parseTaskMarkerSetting,
  shouldDisableHidingForMetadata,
  shouldHideTaskMarker,
} from "../utils";

describe("task marker parsing", () => {
  it("keeps the original completed task regex behavior", () => {
    expect(COMPLETED_TASK_REGEX.test("- [x] completed task")).toBe(true);
    expect(COMPLETED_TASK_REGEX.test("- [X] completed task")).toBe(true);
    expect(COMPLETED_TASK_REGEX.test("- [ ] pending task")).toBe(false);
    expect(COMPLETED_TASK_REGEX.test("- [/] in progress")).toBe(false);
  });

  it("extracts custom checkbox markers", () => {
    expect(getTaskMarkerFromText("- [x] completed")).toBe("x");
    expect(getTaskMarkerFromText("  - [/] in progress")).toBe("/");
    expect(getTaskMarkerFromText("* [-] cancelled")).toBe("-");
    expect(getTaskMarkerFromText("+ [!] important")).toBe("!");
    expect(getTaskMarkerFromText("- regular bullet")).toBeNull();
  });

  it("parses comma and whitespace separated settings", () => {
    expect(parseListSetting("x, X / -")).toEqual(["x", "X", "/", "-"]);
  });

  it("parses each task marker setting character literally", () => {
    expect(parseTaskMarkerSetting("x, X, -, /")).toEqual(["x", ",", " ", "X", ",", " ", "-", ",", " ", "/"]);
    expect(normalizeTaskMarkers(parseTaskMarkerSetting("xxX-/"))).toEqual(["x", "X", "-", "/"]);
  });

  it("normalizes empty marker lists to completed defaults", () => {
    expect(normalizeTaskMarkers([])).toEqual(["x", "X"]);
    expect(normalizeTaskMarkers(["x", "x", "X"])).toEqual(["x", "X"]);
  });
});

describe("task marker hiding modes", () => {
  it("hides only listed markers in hide-listed mode", () => {
    const settings = { mode: "hide-listed" as const, taskMarkers: ["x", "X", "-"] };

    expect(shouldHideTaskMarker("x", settings)).toBe(true);
    expect(shouldHideTaskMarker("-", settings)).toBe(true);
    expect(shouldHideTaskMarker("/", settings)).toBe(false);
    expect(shouldHideTaskMarker(" ", settings)).toBe(false);
    expect(shouldHideTaskMarker("", settings)).toBe(false);
  });

  it("keeps listed markers and hides other non-empty statuses in keep-listed mode", () => {
    const settings = { mode: "keep-listed" as const, taskMarkers: ["?", "/"] };

    expect(shouldHideTaskMarker("?", settings)).toBe(false);
    expect(shouldHideTaskMarker("/", settings)).toBe(false);
    expect(shouldHideTaskMarker("x", settings)).toBe(true);
    expect(shouldHideTaskMarker("-", settings)).toBe(true);
    expect(shouldHideTaskMarker(" ", settings)).toBe(false);
    expect(shouldHideTaskMarker("", settings)).toBe(false);
  });
});

describe("getIndentLevelFromText", () => {
  it("counts spaces and tabs", () => {
    expect(getIndentLevelFromText("- item")).toBe(0);
    expect(getIndentLevelFromText("  - item")).toBe(2);
    expect(getIndentLevelFromText("\t- item")).toBe(4);
    expect(getIndentLevelFromText("\t  - item")).toBe(6);
  });
});

describe("nested line hiding", () => {
  it("hides only matching task lines when hideSubBullets is off", () => {
    const lines = [
      "- [x] completed",
      "  - nested bullet",
      "  - [ ] nested pending",
      "- [ ] independent",
    ];

    expect(getHiddenLineNumbers(lines, {
      hiddenState: true,
      hideSubBullets: false,
      showInEditMode: false,
      mode: "hide-listed",
      taskMarkers: ["x", "X"],
    })).toEqual(new Set([1]));
  });

  it("hides nested bullets and nested unchecked tasks when hideSubBullets is on", () => {
    const lines = [
      "- [x] completed",
      "  - nested bullet",
      "  - [ ] nested pending",
      "  - [/] nested custom status",
      "- [ ] independent",
    ];

    expect(getHiddenLineNumbers(lines, {
      hiddenState: true,
      hideSubBullets: true,
      showInEditMode: false,
      mode: "hide-listed",
      taskMarkers: ["x", "X"],
    })).toEqual(new Set([1, 2, 3, 4]));
  });

  it("stops nested hiding at blank lines", () => {
    const lines = [
      "- [x] completed",
      "  - nested bullet",
      "",
      "  - not part of the completed task",
    ];

    expect(getHiddenLineNumbers(lines, {
      hiddenState: true,
      hideSubBullets: true,
      showInEditMode: false,
      mode: "hide-listed",
      taskMarkers: ["x", "X"],
    })).toEqual(new Set([1, 2]));
  });

  it("supports custom statuses inside nested structures", () => {
    const lines = [
      "- [-] cancelled",
      "  - [/] child",
      "- [/] in progress",
      "- [x] done",
    ];

    expect(getHiddenLineNumbers(lines, {
      hiddenState: true,
      hideSubBullets: true,
      showInEditMode: false,
      mode: "hide-listed",
      taskMarkers: ["-"],
    })).toEqual(new Set([1, 2]));
  });

  it("does not hide unchecked parent tasks when Obsidian exposes an empty data-task marker", () => {
    expect(shouldHideTaskMarker("", {
      mode: "keep-listed",
      taskMarkers: ["x", "X"],
    })).toBe(false);
  });
});

describe("page override tags", () => {
  it("collects frontmatter tags from strings and arrays", () => {
    expect(collectFrontmatterTags("one #two, three")).toEqual(["one", "#two", "three"]);
    expect(collectFrontmatterTags(["one", "#two three"])).toEqual(["one", "#two", "three"]);
  });

  it("matches inline tags from metadata cache", () => {
    expect(shouldDisableHidingForMetadata(
      { tags: [{ tag: "#checkers-show-completed" }] },
      ["checkers-show-completed"],
    )).toBe(true);
  });

  it("matches frontmatter tags from metadata cache", () => {
    expect(shouldDisableHidingForMetadata(
      { frontmatter: { tags: ["project", "ctd-show-completed"] } },
      ["#ctd-show-completed"],
    )).toBe(true);
  });

  it("does not disable hiding when no configured override tag is present", () => {
    expect(shouldDisableHidingForMetadata(
      { tags: [{ tag: "#project" }], frontmatter: { tags: ["done"] } },
      ["checkers-show-completed"],
    )).toBe(false);
  });
});
