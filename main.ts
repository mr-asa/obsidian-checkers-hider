import {
  App,
  CachedMetadata,
  MarkdownView,
  Plugin,
  PluginManifest,
  PluginSettingTab,
  Setting,
  TFile,
  addIcon,
  setIcon,
} from "obsidian";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { Compartment, EditorState, Extension, Facet, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  DEFAULT_TASK_MARKERS,
  HiddenLineSettings,
  TaskMarkerMode,
  getHiddenLineNumbers,
  normalizeTaskMarkers,
  parseListSetting,
  shouldDisableHidingForMetadata,
} from "./utils";

interface TaskHiderSettings extends HiddenLineSettings {
  showStatusBar: boolean;
  disableHidingTags: string[];
}

const DEFAULT_SETTINGS: TaskHiderSettings = {
  hiddenState: true,
  showStatusBar: true,
  hideSubBullets: false,
  mode: "hide-listed",
  taskMarkers: DEFAULT_TASK_MARKERS,
  disableHidingTags: ["checkers-show-completed", "ctd-show-completed"],
};

const ENABLED_VIEW_CLASS = "checkers-hider-enabled";
const DISABLED_VIEW_CLASS = "checkers-hider-disabled";
const STYLE_ID = "checkers-hider-dynamic-css";

const taskHiderSettingsFacet = Facet.define<TaskHiderSettings, TaskHiderSettings>({
  combine: (values) => values[0] || DEFAULT_SETTINGS,
});

const hideTasksField = StateField.define<DecorationSet>({
  create(state: EditorState): DecorationSet {
    return buildLineDecorations(state);
  },
  update(oldDecorations: DecorationSet, tr): DecorationSet {
    if (tr.docChanged || tr.reconfigured) {
      return buildLineDecorations(tr.state);
    }

    return oldDecorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildLineDecorations(state: EditorState): DecorationSet {
  const settings = state.facet(taskHiderSettingsFacet);

  if (!settings.hiddenState) {
    return Decoration.none;
  }

  const doc = state.doc;
  const lines: string[] = [];

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    lines.push(doc.line(lineNum).text);
  }

  const linesToHide = getHiddenLineNumbers(lines, settings);
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    if (!linesToHide.has(lineNum)) {
      continue;
    }

    const line = doc.line(lineNum);
    const nextLineAlsoHidden = linesToHide.has(lineNum + 1);
    const isLastLine = lineNum === doc.lines;
    const endPos = nextLineAlsoHidden && !isLastLine ? line.to + 1 : line.to;

    builder.add(line.from, endPos, Decoration.replace({}));
  }

  return builder.finish();
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function taskSelector(marker: string): string {
  return `[data-task=${cssString(marker)}]`;
}

function buildTaskSelectors(settings: TaskHiderSettings): string[] {
  const markers = normalizeTaskMarkers(settings.taskMarkers);

  if (settings.mode === "keep-listed") {
    const keepSelectors = [taskSelector(" "), ...markers.map(taskSelector)];
    return [`li.task-list-item[data-task]${keepSelectors.map((selector) => `:not(${selector})`).join("")}`];
  }

  return markers.map((marker) => `li.task-list-item${taskSelector(marker)}`);
}

function buildDynamicCss(settings: TaskHiderSettings): string {
  const readingSelectors: string[] = [];

  for (const selector of buildTaskSelectors(settings)) {
    readingSelectors.push(
      `.${ENABLED_VIEW_CLASS}.markdown-preview-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS} .markdown-preview-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS}.markdown-reading-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS} .markdown-reading-view ul > ${selector}`,
    );
  }

  return `${readingSelectors.join(",\n")} {\n  display: none;\n}`;
}

function normalizeSettings(data: Partial<TaskHiderSettings> & {
  incompleteSymbols?: string[];
  invertRule?: boolean;
  hideMarkers?: string[];
} | null | undefined): TaskHiderSettings {
  const migratedMarkers = Array.isArray(data?.hideMarkers)
    ? data?.hideMarkers
    : Array.isArray(data?.incompleteSymbols)
      ? data?.incompleteSymbols
      : data?.taskMarkers;

  const migratedMode: TaskMarkerMode =
    data?.mode === "keep-listed" || data?.mode === "hide-listed"
      ? data.mode
      : Array.isArray(data?.incompleteSymbols) && data?.invertRule !== true
        ? "keep-listed"
        : DEFAULT_SETTINGS.mode;

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    hiddenState: typeof data?.hiddenState === "boolean" ? data.hiddenState : DEFAULT_SETTINGS.hiddenState,
    showStatusBar: typeof data?.showStatusBar === "boolean" ? data.showStatusBar : DEFAULT_SETTINGS.showStatusBar,
    hideSubBullets: typeof data?.hideSubBullets === "boolean" ? data.hideSubBullets : DEFAULT_SETTINGS.hideSubBullets,
    mode: migratedMode,
    taskMarkers: normalizeTaskMarkers(Array.isArray(migratedMarkers) ? migratedMarkers : DEFAULT_SETTINGS.taskMarkers),
    disableHidingTags: Array.isArray(data?.disableHidingTags)
      ? data.disableHidingTags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)
      : DEFAULT_SETTINGS.disableHidingTags,
  };
}

export default class TaskHiderPlugin extends Plugin {
  statusBar: HTMLElement | null = null;
  settings: TaskHiderSettings;
  private settingsCompartment = new Compartment();
  private styleEl: HTMLStyleElement | null = null;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  async toggleCompletedTaskView() {
    this.settings.hiddenState = !this.settings.hiddenState;
    this.applySettingsToWorkspace();
    await this.saveSettings();
  }

  updateBodyClasses() {
    document.body.toggleClass("hide-completed-tasks", this.settings.hiddenState);
    document.body.toggleClass("hide-sub-bullets", this.settings.hideSubBullets);
  }

  updateStatusBar() {
    if (!this.statusBar || !this.settings.showStatusBar) {
      return;
    }

    this.statusBar.setText(
      this.settings.hiddenState ? "Hiding Checkers" : "Showing Checkers",
    );
    this.statusBar.setAttribute("aria-label", "Toggle completed task hiding");
  }

  ensureStatusBar() {
    if (!this.settings.showStatusBar || this.statusBar) {
      return;
    }

    this.statusBar = this.addStatusBarItem();
    setIcon(this.statusBar, "list-checks");
    this.statusBar.addClass("mod-clickable");
    this.statusBar.addEventListener("click", () => {
      this.toggleCompletedTaskView();
    });
    this.updateStatusBar();
  }

  removeStatusBar() {
    if (!this.statusBar) {
      return;
    }

    this.statusBar.remove();
    this.statusBar = null;
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  createEditorExtension(): Extension {
    return [
      this.settingsCompartment.of(taskHiderSettingsFacet.of(this.settings)),
      hideTasksField,
    ];
  }

  getEffectiveSettingsForFile(file: TFile | null | undefined): TaskHiderSettings {
    const metadata = file
      ? this.app.metadataCache.getFileCache(file) as CachedMetadata | null
      : null;
    const disableForPage = shouldDisableHidingForMetadata(
      metadata,
      this.settings.disableHidingTags,
    );

    return {
      ...this.settings,
      hiddenState: this.settings.hiddenState && !disableForPage,
    };
  }

  updateMarkdownView(view: MarkdownView) {
    const effectiveSettings = this.getEffectiveSettingsForFile(view.file);
    const containerEl = view.containerEl;

    containerEl.toggleClass(ENABLED_VIEW_CLASS, effectiveSettings.hiddenState);
    containerEl.toggleClass(DISABLED_VIEW_CLASS, !effectiveSettings.hiddenState);

    const editor = (view as any).editor;
    if (editor?.cm) {
      const cm = editor.cm as EditorView;
      cm.dispatch({
        effects: this.settingsCompartment.reconfigure(
          taskHiderSettingsFacet.of(effectiveSettings),
        ),
      });
    }
  }

  updateEditorExtensions() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() !== "markdown") {
        return;
      }

      this.updateMarkdownView(leaf.view as MarkdownView);
    });
  }

  updateDynamicCss() {
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = STYLE_ID;
      document.head.appendChild(this.styleEl);
    }

    this.styleEl.textContent = buildDynamicCss(this.settings);
  }

  applySettingsToWorkspace() {
    this.updateBodyClasses();
    this.updateStatusBar();
    this.updateDynamicCss();
    this.updateEditorExtensions();
  }

  async onload() {
    try {
      await this.loadSettings();

      if (this.settings.showStatusBar) {
        this.ensureStatusBar();
      }

      this.addCommand({
        id: "toggle-completed-task-view",
        name: "Toggle Checkers Hider",
        callback: () => {
          this.toggleCompletedTaskView();
        },
      });

      this.addSettingTab(new TaskHiderSettingTab(this.app, this));
      this.registerEditorExtension(this.createEditorExtension());

      this.registerEvent(this.app.workspace.on("file-open", () => this.applySettingsToWorkspace()));
      this.registerEvent(this.app.workspace.on("layout-change", () => this.applySettingsToWorkspace()));
      this.registerEvent(this.app.metadataCache.on("changed", () => this.applySettingsToWorkspace()));

      this.app.workspace.onLayoutReady(() => {
        try {
          this.applySettingsToWorkspace();
          addIcon("tasks", taskShowIcon);
          this.addRibbonIcon("tasks", "Checkers Hider", () => {
            this.toggleCompletedTaskView();
          });
        } catch (error) {
          console.error("Failed to initialize Obsidian Checkers Hider UI:", error);
        }
      });
    } catch (error) {
      console.error("Failed to load Obsidian Checkers Hider plugin:", error);
      this.settings = DEFAULT_SETTINGS;
    }
  }

  onunload() {
    if (this.styleEl?.parentElement) {
      this.styleEl.parentElement.removeChild(this.styleEl);
    }
    this.styleEl = null;
  }
}

class TaskHiderSettingTab extends PluginSettingTab {
  plugin: TaskHiderPlugin;

  constructor(app: App, plugin: TaskHiderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian Checkers Hider Settings" });

    new Setting(containerEl)
      .setName("Show status bar toggle")
      .setDesc("Display a clickable status bar control for hiding or showing matching tasks.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusBar)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showStatusBar = value;
            if (value) {
              this.plugin.ensureStatusBar();
            } else {
              this.plugin.removeStatusBar();
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Task marker mode")
      .setDesc("Hide listed markers, or keep listed markers visible and hide other non-empty task statuses.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("hide-listed", "Hide listed markers")
          .addOption("keep-listed", "Keep listed markers")
          .setValue(this.plugin.settings.mode)
          .onChange(async (value: TaskMarkerMode) => {
            this.plugin.settings.mode = value;
            this.plugin.applySettingsToWorkspace();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Task markers")
      .setDesc("Comma- or space-separated checkbox markers. Defaults to x and X.")
      .addText((text) =>
        text
          .setPlaceholder("x, X, -, /")
          .setValue(this.plugin.settings.taskMarkers.join(", "))
          .onChange(async (value: string) => {
            this.plugin.settings.taskMarkers = normalizeTaskMarkers(parseListSetting(value));
            this.plugin.applySettingsToWorkspace();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Hide sub-bullets")
      .setDesc("In Source and Live Preview, also hide indented lines beneath a hidden task until the next blank or same-level line.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.hideSubBullets).onChange(async (value: boolean) => {
          this.plugin.settings.hideSubBullets = value;
          this.plugin.applySettingsToWorkspace();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Page override tags")
      .setDesc("Comma- or space-separated tags that show matching tasks for a page. Tags can be inline or in frontmatter.")
      .addText((text) =>
        text
          .setPlaceholder("checkers-show-completed, ctd-show-completed")
          .setValue(this.plugin.settings.disableHidingTags.join(", "))
          .onChange(async (value: string) => {
            this.plugin.settings.disableHidingTags = parseListSetting(value).map((tag) => tag.replace(/^#/, ""));
            this.plugin.applySettingsToWorkspace();
            await this.plugin.saveSettings();
          }),
      );
  }
}

const taskShowIcon = `<svg aria-hidden="true" focusable="false" data-prefix="fal" data-icon="tasks" class="svg-inline--fa fa-tasks fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M145.35 207a8 8 0 0 0-11.35 0l-71 71-39-39a8 8 0 0 0-11.31 0L1.35 250.34a8 8 0 0 0 0 11.32l56 56a8 8 0 0 0 11.31 0l88-88a8 8 0 0 0 0-11.32zM62.93 384c-17.67 0-32.4 14.33-32.4 32s14.73 32 32.4 32a32 32 0 0 0 0-64zm82.42-337A8 8 0 0 0 134 47l-71 71-39-39a8 8 0 0 0-11.31 0L1.35 90.34a8 8 0 0 0 0 11.32l56 56a8 8 0 0 0 11.31 0l88-88a8 8 0 0 0 0-11.32zM503 400H199a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h304a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8zm0-320H199a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h304a8 8 0 0 0 8-8V88a8 8 0 0 0-8-8zm0 160H199a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h304a8 8 0 0 0 8-8v-16a8 8 0 0 0-8-8z"></path></svg>`;
