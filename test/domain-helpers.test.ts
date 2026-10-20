import { test } from "node:test";
import assert from "node:assert/strict";
import { getRootDomain, isCoveredByAllowRule, parseHostname } from "../src/utils/domain-helpers.ts";

test("parseHostname accepts a bare hostname", () => {
  assert.equal(parseHostname("site.metropolis.io"), "site.metropolis.io");
});

test("parseHostname extracts the host from a URL with path, port and query", () => {
  assert.equal(parseHostname("https://site.metropolis.io/x?y"), "site.metropolis.io");
  assert.equal(parseHostname("http://api.netflix.com:8443/v1/titles?id=7#top"), "api.netflix.com");
  assert.equal(parseHostname("site.metropolis.io/login"), "site.metropolis.io");
});

test("parseHostname extracts the domain from AdGuard rule syntax", () => {
  assert.equal(parseHostname("@@||netflix.com^"), "netflix.com");
  assert.equal(parseHostname("||ads.example.com^"), "ads.example.com");
});

test("parseHostname trims, lowercases and strips a trailing dot", () => {
  assert.equal(parseHostname("  WWW.Netflix.COM  "), "www.netflix.com");
  assert.equal(parseHostname("netflix.com."), "netflix.com");
});

test("parseHostname rejects input that is not a dotted hostname", () => {
  for (const input of ["netflix", "has space.com", "-bad.com", "bad-.com", "a..com", "", "http://", "192.168.1.1"]) {
    assert.equal(parseHostname(input), undefined, JSON.stringify(input));
  }
});

test("isCoveredByAllowRule matches the exact domain", () => {
  assert.equal(isCoveredByAllowRule("netflix.com", new Set(["netflix.com"])), true);
});

test("isCoveredByAllowRule treats a parent rule as covering every subdomain", () => {
  const allowed = new Set(["netflix.com"]);
  assert.equal(isCoveredByAllowRule("api-global.netflix.com", allowed), true);
  assert.equal(isCoveredByAllowRule("a.b.c.netflix.com", allowed), true);
});

test("isCoveredByAllowRule does not cover siblings or parents of an allowed subdomain", () => {
  const allowed = new Set(["api.netflix.com"]);
  assert.equal(isCoveredByAllowRule("www.netflix.com", allowed), false);
  assert.equal(isCoveredByAllowRule("netflix.com", allowed), false);
  assert.equal(isCoveredByAllowRule("v2.api.netflix.com", allowed), true);
});

test("isCoveredByAllowRule does not match a different domain that shares a suffix", () => {
  assert.equal(isCoveredByAllowRule("notnetflix.com", new Set(["netflix.com"])), false);
});

test("isCoveredByAllowRule is false for an empty allow list", () => {
  assert.equal(isCoveredByAllowRule("netflix.com", new Set()), false);
});

test("getRootDomain keeps three labels under a two-part TLD", () => {
  assert.equal(getRootDomain("news.bbc.co.uk"), "bbc.co.uk");
  assert.equal(getRootDomain("api-global.netflix.com"), "netflix.com");
});
