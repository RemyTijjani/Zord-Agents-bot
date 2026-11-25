import test from "node:test";
import assert from "node:assert/strict";
import { detectSentinelThreat } from "../api/_lib/sentinel.mjs";

test("ordinary discussion and a normal single link are not flagged", () => {
  assert.equal(detectSentinelThreat("Welcome everyone, today's discussion is about property management."), null);
  assert.equal(detectSentinelThreat("Here is the government information page: https://www.gov.uk/"), null);
});

test("multiple links are flagged for review but are not treated as high-confidence scams", () => {
  assert.deepEqual(
    detectSentinelThreat("https://one.example https://two.example https://three.example https://four.example"),
    { reason: "multiple_links", severity: "medium" },
  );
});

test("scam language paired with a link is high confidence", () => {
  assert.deepEqual(
    detectSentinelThreat("Claim your reward and get free crypto now: https://claim.example"),
    { reason: "scam_language_with_link", severity: "high" },
  );
});

test("requests for credentials paired with a link are high confidence", () => {
  assert.deepEqual(
    detectSentinelThreat("Send me your seed phrase here: https://wallet-check.example"),
    { reason: "credential_phishing_link", severity: "high" },
  );
});

test("shortened links are flagged for review without automatically deleting", () => {
  assert.deepEqual(
    detectSentinelThreat("Please read this update: https://bit.ly/example"),
    { reason: "shortened_link", severity: "medium" },
  );
});

test("credential requests without a link are flagged for review", () => {
  assert.deepEqual(
    detectSentinelThreat("Send me your verification code"),
    { reason: "credential_request_without_link", severity: "medium" },
  );
});

test("protective advice about credentials is not flagged", () => {
  assert.equal(
    detectSentinelThreat("Never share your seed phrase or verification code with anyone."),
    null,
  );
});

test("possible administrator impersonation is reviewed, and escalates with a link", () => {
  assert.deepEqual(
    detectSentinelThreat("Official support says DM me for help"),
    { reason: "possible_admin_impersonation", severity: "medium" },
  );
  assert.deepEqual(
    detectSentinelThreat("Official support says DM me for help: https://support.example"),
    { reason: "possible_admin_impersonation", severity: "high" },
  );
});

test("empty and non-string payloads are ignored", () => {
  assert.equal(detectSentinelThreat("   "), null);
  assert.equal(detectSentinelThreat(null), null);
  assert.equal(detectSentinelThreat({ text: "free crypto https://claim.example" }), null);
});


test("community-specific official impersonation is detected using only that community profile", () => {
  const profile = { community_name: "Northside Realty" };
  assert.deepEqual(
    detectSentinelThreat("Northside Realty admin, DM me for payment help", profile),
    { reason: "possible_admin_impersonation", severity: "medium" },
  );
  assert.equal(detectSentinelThreat("Northside Realty admin, DM me for payment help", { community_name: "Different Group" }), null);
});
