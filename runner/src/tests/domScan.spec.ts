import { test, expect } from "@playwright/test";
import { sanitizeLabelForKey } from "../auto/domScan";

test("sanitizeLabelForKey strips Open submenu", () => {
  expect(sanitizeLabelForKey("Mevzuat Open submenu")).toBe("Mevzuat");
});

test("sanitizeLabelForKey strips Close submenu and normalizes whitespace", () => {
  expect(sanitizeLabelForKey("  Close submenu  Foo  ")).toBe("Foo");
});

test("sanitizeLabelForKey strips Toggle navigation", () => {
  expect(sanitizeLabelForKey("Toggle navigation")).toBe("");
  expect(sanitizeLabelForKey("Menu Toggle navigation")).toBe("Menu");
});

test("sanitizeLabelForKey normalizes multiple spaces", () => {
  expect(sanitizeLabelForKey("  Mevzuat   Open submenu  ")).toBe("Mevzuat");
});

test("sanitizeLabelForKey returns empty for undefined/null", () => {
  expect(sanitizeLabelForKey(undefined)).toBe("");
  expect(sanitizeLabelForKey("")).toBe("");
});
