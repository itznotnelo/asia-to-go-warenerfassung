import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

interface AppConfig {
  offContactEmail?: string;
}

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

export function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}
