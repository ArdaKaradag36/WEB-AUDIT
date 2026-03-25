import { test, expect } from "@playwright/test";
import {
  detectLoginHeuristic,
  hasAuthKeywords,
  loginPathMatches,
  type LoginProbe,
} from "../core/detectLogin";

function probe(p: Partial<LoginProbe>): LoginProbe {
  return {
    pathname: "/",
    passwordInputsVisible: 0,
    bodyTextPreview: "",
    ...p,
  };
}

test("password field visible implies login wall", () => {
  expect(detectLoginHeuristic(probe({ passwordInputsVisible: 1, pathname: "/products" }))).toBe(true);
  expect(detectLoginHeuristic(probe({ passwordInputsVisible: 1, bodyTextPreview: "Sign in" }))).toBe(true);
});

test("footer-only Sign in on non-auth path is not a login wall", () => {
  expect(
    detectLoginHeuristic(
      probe({
        pathname: "/products",
        bodyTextPreview: "Home\nProducts\nSign in\nContact",
      }),
    ),
  ).toBe(false);
});

test("auth-like path with keyword is login wall", () => {
  expect(
    detectLoginHeuristic(
      probe({
        pathname: "/login",
        bodyTextPreview: "Welcome\nSign in with email",
      }),
    ),
  ).toBe(true);
});

test("auth path without keywords is not enough (avoid bare path false positives)", () => {
  expect(detectLoginHeuristic(probe({ pathname: "/login", bodyTextPreview: "" }))).toBe(false);
});

test("loginPathMatches common segments", () => {
  expect(loginPathMatches("/en/login")).toBe(true);
  expect(loginPathMatches("/account/signin")).toBe(true);
  expect(loginPathMatches("/blog/login-tips")).toBe(false);
  expect(loginPathMatches("/")).toBe(false);
});

test("hasAuthKeywords", () => {
  expect(hasAuthKeywords("Please Sign in to continue")).toBe(true);
  expect(hasAuthKeywords("Just browsing")).toBe(false);
});
