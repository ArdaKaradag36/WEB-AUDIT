import type { Plugin } from "./types";
import { cookieConsentPlugin } from "./builtins/cookie-consent";
import { nviCookieConsentPlugin } from "./builtins/nvi-cookie-consent";
import { authBasicPlugin } from "./builtins/auth-basic";

export const pluginRegistry: Record<string, Plugin> = {
  "cookie-consent": cookieConsentPlugin,
  "nvi-cookie-consent": nviCookieConsentPlugin,
  "auth-basic": authBasicPlugin,
};
