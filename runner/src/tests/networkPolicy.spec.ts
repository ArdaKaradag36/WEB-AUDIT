import { test, expect } from "@playwright/test";
import { isPrivateIpLiteral, isPrivateIpv6Literal, isPrivateHostname } from "../core/networkPolicy";

test("isPrivateIpLiteral: private IPv4 addresses return true", () => {
  expect(isPrivateIpLiteral("10.0.0.1")).toBe(true);
  expect(isPrivateIpLiteral("172.16.0.1")).toBe(true);
  expect(isPrivateIpLiteral("172.31.255.255")).toBe(true);
  expect(isPrivateIpLiteral("192.168.1.1")).toBe(true);
  expect(isPrivateIpLiteral("127.0.0.1")).toBe(true);
  expect(isPrivateIpLiteral("169.254.169.254")).toBe(true);
  expect(isPrivateIpLiteral("100.64.0.1")).toBe(true);
  expect(isPrivateIpLiteral("0.0.0.1")).toBe(true);
});

test("isPrivateIpLiteral: public IPv4 addresses return false", () => {
  expect(isPrivateIpLiteral("1.1.1.1")).toBe(false);
  expect(isPrivateIpLiteral("8.8.8.8")).toBe(false);
  expect(isPrivateIpLiteral("93.184.216.34")).toBe(false);
});

test("isPrivateIpv6Literal: IPv6 loopback and link-local return true", () => {
  expect(isPrivateIpv6Literal("::1")).toBe(true);
  expect(isPrivateIpv6Literal("fe80::1")).toBe(true);
  expect(isPrivateIpv6Literal("fc00::1")).toBe(true);
  expect(isPrivateIpv6Literal("fd00::1")).toBe(true);
});

test("isPrivateIpv6Literal: IPv4-mapped private addresses return true", () => {
  expect(isPrivateIpv6Literal("::ffff:127.0.0.1")).toBe(true);
  expect(isPrivateIpv6Literal("::ffff:192.168.0.1")).toBe(true);
});

test("isPrivateIpv6Literal: IPv4-mapped public addresses return false", () => {
  expect(isPrivateIpv6Literal("::ffff:8.8.8.8")).toBe(false);
  expect(isPrivateIpv6Literal("::ffff:1.1.1.1")).toBe(false);
});

test("isPrivateHostname: localhost variants return true", async () => {
  expect(await isPrivateHostname("localhost")).toBe(true);
  expect(await isPrivateHostname("foo.localhost")).toBe(true);
});

test("isPrivateHostname: IP literals checked directly", async () => {
  expect(await isPrivateHostname("127.0.0.1")).toBe(true);
  expect(await isPrivateHostname("::1")).toBe(true);
  expect(await isPrivateHostname("1.1.1.1")).toBe(false);
});

test("isPrivateHostname: allowPrivate=true bypasses checks", async () => {
  expect(await isPrivateHostname("127.0.0.1", { allowPrivate: true })).toBe(false);
  expect(await isPrivateHostname("localhost", { allowPrivate: true })).toBe(false);
});
