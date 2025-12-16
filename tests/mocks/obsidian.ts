// Mock obsidian module for testing
// Only includes the exports used by main.ts

export class App {}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(_command: any) {}
  addRibbonIcon(_icon: string, _title: string, _callback: () => void) {}
  addSettingTab(_tab: any) {}
  addStatusBarItem() {
    return {
      setText: (_text: string) => {},
      remove: () => {},
    };
  }
  registerEditorExtension(_extension: any) {}
  loadData() {
    return Promise.resolve({});
  }
  saveData(_data: any) {
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {} as HTMLElement;
  }

  display() {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string) {
    return this;
  }
  setDesc(_desc: string) {
    return this;
  }
  addToggle(_callback: (toggle: any) => void) {
    return this;
  }
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export function addIcon(_name: string, _svg: string) {}
