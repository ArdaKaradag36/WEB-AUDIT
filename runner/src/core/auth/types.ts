import type { Page, BrowserContext } from "playwright";

export type AuthProfileType = "NONE" | "BASIC_AUTH" | "COOKIE_SESSION" | "FORM_LOGIN_STEPS";

export type LoginStep =
  | { type: "goto"; url: string }
  | { type: "waitFor"; ms: number }
  | { type: "fill"; selector: string; value: string }
  | { type: "click"; selector: string }
  | { type: "assertText"; selector: string; text: string }
  | { type: "assertUrl"; urlContains: string };

export type BasicAuthConfig = {
  username: string;
  password: string;
};

export type CookieSessionConfig = {
  /** Opaque storage ID; actual snapshot is stored/encrypted by the backend. */
  storageId: string;
};

export type FormLoginConfig = {
  /** Optional explicit login entry URL; if omitted, caller must navigate beforehand. */
  entryUrl?: string;
  steps: LoginStep[];
};

export type AuthProfileConfig =
  | { type: "NONE" }
  | { type: "BASIC_AUTH"; basic: BasicAuthConfig }
  | { type: "COOKIE_SESSION"; session: CookieSessionConfig }
  | { type: "FORM_LOGIN_STEPS"; form: FormLoginConfig };

export type AuthBlockedReason = "CAPTCHA_DETECTED" | "OTP_REQUIRED" | "GENERIC_AUTH_BLOCK";

export type AuthResultStatus = "OK" | "BLOCKED" | "FAILED";

export type AuthResult = {
  status: AuthResultStatus;
  blockedReason?: AuthBlockedReason;
  errorMessage?: string;
};

export type AuthSessionSnapshot = {
  /** Playwright storageState JSON, to be encrypted & stored by the backend. */
  storageState: unknown;
};

export interface LoginExecutorContext {
  page: Page;
  context: BrowserContext;
  profile: AuthProfileConfig;
}

