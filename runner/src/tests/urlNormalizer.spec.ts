import { test, expect } from "@playwright/test";
import { canonicalizeUrl } from "../core/crawler/urlNormalizer";

test("canonicalizeUrl removes fragment and lowercases host", () => {
  const base = "https://Example.com/path";
  const u = canonicalizeUrl(base, "https://Example.com/foo#section");
  expect(u).not.toBeNull();
  expect(u!.toString()).toBe("https://example.com/foo");
});

test("canonicalizeUrl normalizes default ports", () => {
  const u1 = canonicalizeUrl("http://a:80", "http://a:80/foo");
  const u2 = canonicalizeUrl("https://a:443", "https://a:443/bar");
  expect(u1!.toString()).toBe("http://a/foo");
  expect(u2!.toString()).toBe("https://a/bar");
});

test("canonicalizeUrl strips tracking parameters and sorts others", () => {
  const base = "https://example.com";
  const u = canonicalizeUrl(
    base,
    "https://example.com/page?utm_source=x&b=2&a=1&gclid=foo",
  );
  expect(u!.toString()).toBe("https://example.com/page?a=1&b=2");
});

test("canonicalizeUrl returns null for non-http schemes", () => {
  const base = "https://example.com";
  expect(canonicalizeUrl(base, "mailto:test@example.com")).toBeNull();
  expect(canonicalizeUrl(base, "ftp://example.com/file")).toBeNull();
});

