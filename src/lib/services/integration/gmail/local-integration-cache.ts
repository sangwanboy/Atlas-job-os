import * as fs from "node:fs";
import * as path from "node:path";

export type LocalIntegrationSettings = {
  googleClientId: string;
  googleClientSecret: string;
  autoMatch: boolean;
  autoCreateJob: boolean;
  draftFirstMode: boolean;
  trackedLabelId?: string;
  // Account Fallback
  account?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
    status: string;
    syncStatus?: string;
    lastSyncedAt?: number;
    syncError?: string;
  };
};

const MEMORY_DIR = path.join(process.cwd(), "project_memory");
const SETTINGS_FILE = path.join(MEMORY_DIR, "gmail_settings.json");

function ensureDirectory() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function readSettings(): LocalIntegrationSettings {
  try {
    ensureDirectory();
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {
        googleClientId: "",
        googleClientSecret: "",
        autoMatch: true,
        autoCreateJob: false,
        draftFirstMode: true,
      };
    }
    const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return JSON.parse(content) as LocalIntegrationSettings;
  } catch (error) {
    console.error("[localIntegrationCache] Failed to read settings:", error);
    return {
      googleClientId: "",
      googleClientSecret: "",
      autoMatch: true,
      autoCreateJob: false,
      draftFirstMode: true,
    };
  }
}

function writeSettings(settings: LocalIntegrationSettings) {
  try {
    ensureDirectory();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (error) {
    console.error("[localIntegrationCache] Failed to write settings:", error);
  }
}

export const localIntegrationCache = {
  get(): LocalIntegrationSettings {
    return readSettings();
  },
  save(settings: Partial<LocalIntegrationSettings>): LocalIntegrationSettings {
    const current = readSettings();
    const updated = { ...current, ...settings };
    writeSettings(updated);
    return updated;
  },
  saveAccount(account: LocalIntegrationSettings["account"]): LocalIntegrationSettings {
    const current = readSettings();
    const updated = { ...current, account };
    writeSettings(updated);
    return updated;
  },
  update(settings: Partial<LocalIntegrationSettings>): LocalIntegrationSettings {
    const current = readSettings();
    const updated = { ...current, ...settings };
    if (settings.account && current.account) {
      updated.account = { ...current.account, ...settings.account };
    }
    writeSettings(updated);
    return updated;
  }
};
