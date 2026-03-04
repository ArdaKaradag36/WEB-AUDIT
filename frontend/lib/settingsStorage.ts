export type RunnerMode = "headless" | "debug";

export interface ProfileSettings {
  fullName: string;
  email: string;
  organization: string;
  role: "Admin" | "Kullanıcı";
}

export interface RunnerSettings {
  mode: RunnerMode;
  browser: "chromium" | "firefox" | "webkit";
  maxLinks: number;
  timeoutSeconds: number;
  screenshot: boolean;
  trace: boolean;
  strictMode: boolean;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  onCompleted: boolean;
  onFailed: boolean;
  onCriticalFinding: boolean;
  weeklySummary: boolean;
  emailAddress: string;
}

const PROFILE_KEY = "kamu-settings-profile";
const RUNNER_KEY = "kamu-settings-runner";
const NOTIFY_KEY = "kamu-settings-notifications";

export const defaultProfileSettings: ProfileSettings = {
  fullName: "Admin Kullanıcı",
  email: "",
  organization: "",
  role: "Admin"
};

export const defaultRunnerSettings: RunnerSettings = {
  mode: "headless",
  browser: "chromium",
  maxLinks: 20,
  timeoutSeconds: 60,
  screenshot: true,
  trace: true,
  strictMode: false
};

export const defaultNotificationSettings: NotificationSettings = {
  emailEnabled: true,
  onCompleted: true,
  onFailed: true,
  onCriticalFinding: true,
  weeklySummary: true,
  emailAddress: ""
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed };
  } catch (error) {
    // Corrupt local storage entry; log and fall back to defaults.
    // Import is local to avoid cyclic deps at module top-level.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { logError } = require("../utils/errorHandler") as typeof import("../utils/errorHandler");
    logError(error, { scope: "settingsStorage.safeParse" });
    return fallback;
  }
}

export async function loadProfileSettings(): Promise<ProfileSettings> {
  if (typeof window === "undefined") return defaultProfileSettings;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  return safeParse(raw, defaultProfileSettings);
}

export async function saveProfileSettings(value: ProfileSettings): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
}

export async function loadRunnerSettings(): Promise<RunnerSettings> {
  if (typeof window === "undefined") return defaultRunnerSettings;
  const raw = window.localStorage.getItem(RUNNER_KEY);
  return safeParse(raw, defaultRunnerSettings);
}

export async function saveRunnerSettings(value: RunnerSettings): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RUNNER_KEY, JSON.stringify(value));
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  if (typeof window === "undefined") return defaultNotificationSettings;
  const raw = window.localStorage.getItem(NOTIFY_KEY);
  return safeParse(raw, defaultNotificationSettings);
}

export async function saveNotificationSettings(
  value: NotificationSettings
): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFY_KEY, JSON.stringify(value));
}

