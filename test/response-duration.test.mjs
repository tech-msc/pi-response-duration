import test from "node:test";
import assert from "node:assert/strict";
import { getResponseDuration } from "../duration.js";

test("does not annotate runs without a user-response start time", () => {
  assert.equal(getResponseDuration(undefined, 60_000, "completed", "tui"), undefined);
});

test("annotates completed TUI responses only when they exceed 30 seconds", () => {
  assert.equal(getResponseDuration(0, 30_000, "completed", "tui"), undefined);
  assert.equal(getResponseDuration(0, 30_001, "completed", "tui"), "31s");
});

test("rounds up seconds and formats minutes", () => {
  assert.equal(getResponseDuration(0, 31_001, "completed", "tui"), "32s");
  assert.equal(getResponseDuration(0, 60_001, "completed", "tui"), "1m 1s");
});

test("does not annotate aborted or failed runs", () => {
  assert.equal(getResponseDuration(0, 60_000, "aborted", "tui"), undefined);
  assert.equal(getResponseDuration(0, 60_000, "error", "tui"), undefined);
});

test("does not annotate responses outside the TUI", () => {
  assert.equal(getResponseDuration(0, 60_000, "completed", "print"), undefined);
});
