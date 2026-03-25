import { test, expect } from "@playwright/test";
import { sanitizeValue } from "../core/sanitize";

test("sanitizeValue: password key is redacted", () => {
  const result = sanitizeValue({ password: "secret", user: "alice" }) as Record<string, unknown>;
  expect(result["password"]).toBe("[REDACTED]");
  expect(result["user"]).toBe("alice");
});

test("sanitizeValue: token key is redacted", () => {
  const result = sanitizeValue({ token: "abc123", id: 1 }) as Record<string, unknown>;
  expect(result["token"]).toBe("[REDACTED]");
  expect(result["id"]).toBe(1);
});

test("sanitizeValue: Bearer token pattern in string is redacted", () => {
  const result = sanitizeValue({ msg: "Bearer abcdefghijklmnopqrstuvwxyz123" }) as Record<string, unknown>;
  expect(result["msg"]).toBe("Bearer [REDACTED]");
});

test("sanitizeValue: Bearer token shorter than 20 chars is not redacted", () => {
  const result = sanitizeValue({ msg: "Bearer short" }) as Record<string, unknown>;
  expect(result["msg"]).toBe("Bearer short");
});

test("sanitizeValue: nested sensitive keys are redacted", () => {
  const result = sanitizeValue({ auth: { authorization: "token xyz" }, name: "test" }) as any;
  expect(result.auth.authorization).toBe("[REDACTED]");
  expect(result.name).toBe("test");
});

test("sanitizeValue: api_key is redacted", () => {
  const result = sanitizeValue({ api_key: "MY_SECRET_KEY_12345" }) as Record<string, unknown>;
  expect(result["api_key"]).toBe("[REDACTED]");
});

test("sanitizeValue: arrays are recursively processed", () => {
  const result = sanitizeValue([{ password: "s3cr3t", name: "bob" }]) as any[];
  expect(result[0]["password"]).toBe("[REDACTED]");
  expect(result[0]["name"]).toBe("bob");
});

test("sanitizeValue: null and undefined values are preserved", () => {
  expect(sanitizeValue(null)).toBeNull();
  expect(sanitizeValue(undefined)).toBeUndefined();
});
