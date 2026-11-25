import test from "node:test";
import assert from "node:assert/strict";
import { splitSqlStatements } from "../scripts/split-sql.mjs";

test("splits ordinary statements and ignores semicolons in line comments", () => {
  assert.deepEqual(splitSqlStatements(
    "SELECT 1; -- comment; still a comment\nSELECT 2;"
  ), ["SELECT 1", "-- comment; still a comment\nSELECT 2"]);
});

test("preserves semicolons inside single-quoted and escaped strings", () => {
  assert.deepEqual(splitSqlStatements(
    "INSERT INTO notes(value) VALUES ('one; two'), (E'three\\; four'); SELECT 5;"
  ), ["INSERT INTO notes(value) VALUES ('one; two'), (E'three\\; four')", "SELECT 5"]);
});

test("preserves semicolons inside quoted identifiers and block comments", () => {
  assert.deepEqual(splitSqlStatements(
    'SELECT "column;name" /* outer; /* nested; */ done */ FROM items;'
  ), ['SELECT "column;name" /* outer; /* nested; */ done */ FROM items']);
});

test("keeps dollar-quoted function bodies intact", () => {
  const source = "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN PERFORM 1; PERFORM 2; END; $body$ LANGUAGE plpgsql; SELECT 3;";
  assert.deepEqual(splitSqlStatements(source), [
    "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN PERFORM 1; PERFORM 2; END; $body$ LANGUAGE plpgsql",
    "SELECT 3",
  ]);
});

test("rejects unterminated quoted SQL", () => {
  assert.throws(() => splitSqlStatements("SELECT 'unfinished"), /Unterminated SQL single quote/);
  assert.throws(() => splitSqlStatements("SELECT 1 /* unfinished"), /Unterminated SQL block comment/);
});
