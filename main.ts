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
  showRibbonIcon: boolean;
  disableHidingTags: string[];
}

const DEFAULT_SETTINGS: TaskHiderSettings = {
  hiddenState: true,
  showStatusBar: true,
  showRibbonIcon: true,
  hideSubBullets: false,
  showInEditMode: false,
  mode: "hide-listed",
  taskMarkers: DEFAULT_TASK_MARKERS,
  disableHidingTags: ["checkers-show-completed", "ctd-show-completed"],
};

const ENABLED_VIEW_CLASS = "checkers-hider-enabled";
const DISABLED_VIEW_CLASS = "checkers-hider-disabled";
const STYLE_ID = "checkers-hider-dynamic-css";
const SUPPORTED_VIEW_TYPES = new Set(["markdown", "kanban", "canvas"]);

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

    builder.add(line.from, endPos, Decoration.replace({ block: true }));
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
  const selectorPrefixes = ["li.task-list-item", "li.dataview.task-list-item"];

  if (settings.mode === "keep-listed") {
    const keepSelectors = [taskSelector(""), taskSelector(" "), ...markers.map(taskSelector)];
    return selectorPrefixes.map((prefix) => `${prefix}[data-task]${keepSelectors.map((selector) => `:not(${selector})`).join("")}`);
  }

  const selectors: string[] = [];
  for (const marker of markers) {
    for (const prefix of selectorPrefixes) {
      selectors.push(`${prefix}${taskSelector(marker)}`);
    }
  }
  return selectors;
}

function buildDynamicCss(settings: TaskHiderSettings): string {
  const readingSelectors: string[] = [];

  for (const selector of buildTaskSelectors(settings)) {
    readingSelectors.push(
      `.${ENABLED_VIEW_CLASS}.markdown-preview-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS} .markdown-preview-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS}.markdown-reading-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS} .markdown-reading-view ul > ${selector}`,
      `.${ENABLED_VIEW_CLASS} ul.contains-task-list > ${selector}`,
      `.${ENABLED_VIEW_CLASS} ul > ${selector}`,
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
    showRibbonIcon: typeof data?.showRibbonIcon === "boolean" ? data.showRibbonIcon : DEFAULT_SETTINGS.showRibbonIcon,
    hideSubBullets: typeof data?.hideSubBullets === "boolean" ? data.hideSubBullets : DEFAULT_SETTINGS.hideSubBullets,
    showInEditMode: typeof data?.showInEditMode === "boolean" ? data.showInEditMode : DEFAULT_SETTINGS.showInEditMode,
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
  private ribbonIconEl: HTMLElement | null = null;
  private popoverObserver: MutationObserver | null = null;
  private popoverUpdateHandle: number | null = null;

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

    this.statusBar.empty();
    setIcon(this.statusBar, "checkers-hider-status-icon");
    this.statusBar.toggleClass("checkers-hider-status-enabled", this.settings.hiddenState);
    this.statusBar.toggleClass("checkers-hider-status-disabled", !this.settings.hiddenState);
    this.statusBar.setAttribute(
      "aria-label",
      this.settings.hiddenState
        ? "Checkers Hider enabled. Click to show matching tasks."
        : "Checkers Hider disabled. Click to hide matching tasks.",
    );
  }

  ensureStatusBar() {
    if (!this.settings.showStatusBar || this.statusBar) {
      return;
    }

    this.statusBar = this.addStatusBarItem();
    setIcon(this.statusBar, "checkers-hider-status-icon");
    this.statusBar.addClass("checkers-hider-status");
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

  ensureRibbonIcon() {
    if (!this.settings.showRibbonIcon || this.ribbonIconEl) {
      return;
    }

    addIcon("tasks", taskShowIcon);
    this.ribbonIconEl = this.addRibbonIcon("tasks", "Checkers Hider", () => {
      this.toggleCompletedTaskView();
    });
  }

  removeRibbonIcon() {
    if (!this.ribbonIconEl) {
      return;
    }

    this.ribbonIconEl.remove();
    this.ribbonIconEl = null;
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  createEditorExtension(): Extension {
    const editorSettings = {
      ...this.settings,
      hiddenState: this.settings.hiddenState && !this.settings.showInEditMode,
    };

    return [
      this.settingsCompartment.of(taskHiderSettingsFacet.of(editorSettings)),
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
    const editorSettings = {
      ...effectiveSettings,
      hiddenState: effectiveSettings.hiddenState && !this.settings.showInEditMode,
    };
    const containerEl = view.containerEl;

    containerEl.toggleClass(ENABLED_VIEW_CLASS, effectiveSettings.hiddenState);
    containerEl.toggleClass(DISABLED_VIEW_CLASS, !effectiveSettings.hiddenState);

    const editor = (view as any).editor;
    if (editor?.cm) {
      const cm = editor.cm as EditorView;
      cm.dispatch({
        effects: this.settingsCompartment.reconfigure(
          taskHiderSettingsFacet.of(editorSettings),
        ),
      });
    }
  }

  updateSupportedView(view: MarkdownView | { file?: TFile | null; containerEl: HTMLElement }) {
    const effectiveSettings = this.getEffectiveSettingsForFile(view.file);
    view.containerEl.toggleClass(ENABLED_VIEW_CLASS, effectiveSettings.hiddenState);
    view.containerEl.toggleClass(DISABLED_VIEW_CLASS, !effectiveSettings.hiddenState);
  }

  shouldShowPopoverTasksForEditContext(popover: HTMLElement): boolean {
    if (!this.settings.showInEditMode) {
      return false;
    }

    return !!popover.querySelector(".markdown-source-view, .cm-editor, .cm-content");
  }

  resolveFileFromElement(el: HTMLElement): TFile | null {
    const activeFile = this.app.workspace.getActiveFile();
    const sourcePath = activeFile?.path || "";
    const pathAttrs = ["data-path", "src", "data-href", "href"];
    const candidates: string[] = [];

    for (const attr of pathAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        candidates.push(value);
      }
    }

    for (const child of Array.from(el.querySelectorAll<HTMLElement>("[data-path], [src], [data-href], [href]"))) {
      for (const attr of pathAttrs) {
        const value = child.getAttribute(attr);
        if (value) {
          candidates.push(value);
        }
      }
    }

    for (const candidate of candidates) {
      const cleanPath = candidate
        .replace(/^obsidian:\/\//, "")
        .replace(/^#/, "")
        .split("#")[0]
        .trim();

      if (!cleanPath) {
        continue;
      }

      const directFile = this.app.vault.getAbstractFileByPath(cleanPath);
      if (directFile instanceof TFile) {
        return directFile;
      }

      const linkedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourcePath);
      if (linkedFile) {
        return linkedFile;
      }
    }

    return null;
  }

  updatePopoverContainers(root: ParentNode = document) {
    const popovers = Array.from(root.querySelectorAll<HTMLElement>(".popover, .hover-popover"));

    if (root instanceof HTMLElement && (root.hasClass("popover") || root.hasClass("hover-popover"))) {
      popovers.push(root);
    }

    for (const popover of popovers) {
      if (!popover.querySelector(".markdown-preview-view, .markdown-reading-view, .markdown-embed, .markdown-source-view, .cm-editor")) {
        continue;
      }

      const file = this.resolveFileFromElement(popover);
      const effectiveSettings = this.getEffectiveSettingsForFile(file);
      const shouldHideInPopover = effectiveSettings.hiddenState && !this.shouldShowPopoverTasksForEditContext(popover);
      popover.toggleClass(ENABLED_VIEW_CLASS, shouldHideInPopover);
      popover.toggleClass(DISABLED_VIEW_CLASS, !shouldHideInPopover);
    }
  }

  schedulePopoverUpdate(root: ParentNode = document) {
    if (this.popoverUpdateHandle !== null) {
      return;
    }

    this.popoverUpdateHandle = window.requestAnimationFrame(() => {
      this.popoverUpdateHandle = null;
      this.updatePopoverContainers(root);
    });
  }

  updateEditorExtensions() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const viewType = leaf.view.getViewType();

      if (!SUPPORTED_VIEW_TYPES.has(viewType)) {
        return;
      }

      this.updateSupportedView(leaf.view as MarkdownView);

      if (viewType === "markdown") {
        this.updateMarkdownView(leaf.view as MarkdownView);
      }
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
    this.updatePopoverContainers();
  }

  observePopovers() {
    if (this.popoverObserver) {
      return;
    }

    this.popoverObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            this.schedulePopoverUpdate(node);
          }
        }
      }
    });

    this.popoverObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async onload() {
    try {
      await this.loadSettings();
      addIcon("checkers-hider-status-icon", checkSquareIcon);

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
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.applySettingsToWorkspace()));
      this.registerEvent(this.app.workspace.on("layout-change", () => this.applySettingsToWorkspace()));
      this.registerEvent(this.app.metadataCache.on("changed", () => this.applySettingsToWorkspace()));
      this.observePopovers();

      this.app.workspace.onLayoutReady(() => {
        try {
          this.applySettingsToWorkspace();
          this.ensureRibbonIcon();
        } catch (error) {
          console.error("Failed to initialize Checkers Hider UI:", error);
        }
      });
    } catch (error) {
      console.error("Failed to load Checkers Hider plugin:", error);
      this.settings = DEFAULT_SETTINGS;
    }
  }

  onunload() {
    this.popoverObserver?.disconnect();
    this.popoverObserver = null;
    if (this.popoverUpdateHandle !== null) {
      window.cancelAnimationFrame(this.popoverUpdateHandle);
      this.popoverUpdateHandle = null;
    }

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
    containerEl.createEl("h2", { text: "Checkers Hider Settings" });

    new Setting(containerEl)
      .setName("Show status bar toggle")
      .setDesc("Display a clickable colored icon in the status bar.")
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
      .setName("Show ribbon button")
      .setDesc("Display the toggle button in the left ribbon.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showRibbonIcon = value;
            if (value) {
              this.plugin.ensureRibbonIcon();
            } else {
              this.plugin.removeRibbonIcon();
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
      .setName("Show all checkboxes in edit mode")
      .setDesc("Keep Source mode and Live Preview fully visible while still hiding matching tasks in Reading view.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInEditMode).onChange(async (value: boolean) => {
          this.plugin.settings.showInEditMode = value;
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

const checkSquareIcon = `<svg aria-hidden="true" focusable="false" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="m8 12 3 3 5-6"></path></svg>`;
