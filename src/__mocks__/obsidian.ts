// Mock for the 'obsidian' module used in tests
export class Plugin {
  private _data: Record<string, unknown> = {};
  async loadData(): Promise<Record<string, unknown>> {
    return structuredClone(this._data);
  }
  async saveData(data: Record<string, unknown>): Promise<void> {
    this._data = structuredClone(data);
  }
}
export class PluginSettingTab {}
export class Setting {}
export class Notice {
  constructor(_message?: string, _duration?: number) {}
  hide(): void {}
}
