import test from "node:test";
import assert from "node:assert/strict";
import { detectPolyShieldToxicity } from "../api/_lib/poly-shield.mjs";

test("detects explicit abusive or threatening phrases in supported fallback languages", () => {
  for (const phrase of [
    "You should kill yourself",
    "Go die",
    "You are worthless",
    "Vete a morir",
    "Muérete",
    "Ferme ta gueule",
    "اذهب للموت",
    "سأقتلك",
  ]) {
    assert.equal(detectPolyShieldToxicity(phrase), true, phrase);
  }
});

test("matching is case-insensitive and Unicode-normalized", () => {
  assert.equal(detectPolyShieldToxicity("YOU ARE WORTHLESS"), true);
  assert.equal(detectPolyShieldToxicity("Muérete"), true);
});

test("ordinary disagreement and criticism are not flagged", () => {
  assert.equal(detectPolyShieldToxicity("I strongly disagree with this proposal."), false);
  assert.equal(detectPolyShieldToxicity("This service is unreliable and needs improvement."), false);
});

test("protective and educational references are not flagged as abuse", () => {
  assert.equal(detectPolyShieldToxicity("Don't tell anyone to kill yourself; report threats to moderators."), false);
  assert.equal(detectPolyShieldToxicity("The phrase 'go die' is an example of harmful language."), false);
  assert.equal(detectPolyShieldToxicity("Never use 'you are worthless' to attack another person."), false);
});

test("empty, non-string and oversized payloads are handled safely", () => {
  assert.equal(detectPolyShieldToxicity(""), false);
  assert.equal(detectPolyShieldToxicity(null), false);
  assert.equal(detectPolyShieldToxicity({ text: "go die" }), false);
  assert.equal(detectPolyShieldToxicity("x".repeat(5000)), false);
});
