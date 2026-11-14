import test from "node:test";
import assert from "node:assert/strict";
import extension from "../index.ts";

const WALL_TIME = 1_800_000_000_000;

function harness(t, mode = "tui") {
  let now = 0;
  const handlers = new Map();
  const entries = [];
  t.mock.method(performance, "now", () => now);
  t.mock.method(Date, "now", () => WALL_TIME + now);
  extension({
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    registerEntryRenderer() {},
    appendEntry(customType, data) {
      entries.push({ type: "custom", customType, data });
    },
  });
  return {
    entries,
    at(value) { now = value; },
    async emit(type, data = {}) {
      const event = { type, ...data };
      // Model boundary proposals being committed, as well as appendEntry writes.
      if (type === "agent_before_settle") {
        Object.assign(event, { entries: [], continue: false, context: [], ...data });
      }
      for (const handler of handlers.get(type) ?? []) {
        const result = await handler(event, { mode });
        if (type === "agent_before_settle" && result) Object.assign(event, result);
      }
      if (type === "agent_before_settle") entries.push(...event.entries);
    },
  };
}

async function start(h, messageType = "user") {
  await h.emit("before_agent_start", { messageType, prompt: "request", images: [], systemPrompt: "" });
}

async function boundary(h, outcome = "completed") {
  await h.emit("agent_before_settle", { outcome });
}

async function settle(h, aborted = false) {
  await h.emit("agent_settled", { aborted });
}

function expectDuration(h, duration, endedAt) {
  assert.deepEqual(h.entries, [{
    type: "custom", customType: "response-duration",
    data: { duration, completedAt: WALL_TIME + endedAt },
  }]);
}

test("normal response writes only at settled, once, using the settled time", async (t) => {
  const h = harness(t);
  await start(h);
  h.at(31_000);
  await boundary(h);
  assert.deepEqual(h.entries, [], "boundary is not final");
  h.at(34_000);
  await settle(h);
  expectDuration(h, "34s", 34_000);
  await settle(h);
  expectDuration(h, "34s", 34_000);
});

test("foreground wait and two boundaries retain the original wall-clock start", async (t) => {
  const h = harness(t);
  await start(h);
  // A foreground tool is awaited while the main agent stays active; no child timers.
  h.at(20_000);
  await h.emit("agent_end", { messages: [] });
  await boundary(h);
  assert.deepEqual(h.entries, []);
  h.at(65_000);
  await h.emit("agent_end", { messages: [] });
  await boundary(h);
  assert.deepEqual(h.entries, [], "continuation boundary must not emit");
  h.at(70_000);
  await settle(h);
  expectDuration(h, "1m 10s", 70_000);
});

test("settled measures the main response even if unknown background work remains", async (t) => {
  const h = harness(t);
  // External jobs have no generic Pi event: do not simulate vendor completion signals.
  await start(h);
  h.at(20_000);
  await boundary(h);
  h.at(40_000);
  await settle(h);
  expectDuration(h, "40s", 40_000);
  h.at(90_000);
  await start(h, "custom");
  await boundary(h);
  await settle(h);
  expectDuration(h, "40s", 40_000);
});

for (const [label, mode, end, count] of [
  ["exact threshold", "tui", 30_000, 0],
  ["above threshold", "tui", 30_001, 1],
  ["print mode", "print", 60_000, 0],
  ["rpc mode", "rpc", 60_000, 0],
]) {
  test(`settled eligibility: ${label}`, async (t) => {
    const h = harness(t, mode);
    await start(h);
    h.at(20_000);
    await boundary(h);
    h.at(end);
    await settle(h);
    assert.equal(h.entries.length, count);
    if (count) expectDuration(h, "31s", end);
  });
}

for (const outcome of ["error", "aborted"]) {
  test(`${outcome} outcome does not annotate or leak into the next run`, async (t) => {
    const h = harness(t);
    await start(h);
    h.at(60_000);
    await boundary(h, outcome);
    await settle(h, outcome === "aborted");
    await start(h, "custom");
    h.at(120_000);
    await boundary(h);
    await settle(h);
    assert.deepEqual(h.entries, []);
  });
}

for (const withBoundary of [false, true]) {
  test(`abort ${withBoundary ? "after" : "without"} boundary discards the user start`, async (t) => {
    const h = harness(t);
    await start(h);
    h.at(60_000);
    if (withBoundary) await boundary(h);
    await settle(h, true);
    assert.deepEqual(h.entries, [], "aborted responses must never be annotated");
    await start(h, "custom");
    h.at(120_000);
    await boundary(h);
    await settle(h);
    assert.deepEqual(h.entries, [], "aborted start must not leak");
  });
}

test("latest boundary outcome wins after continuation", async (t) => {
  const h = harness(t);
  await start(h);
  h.at(20_000);
  await boundary(h, "error");
  h.at(60_000);
  await boundary(h, "completed");
  await settle(h);
  expectDuration(h, "1m 0s", 60_000);
});

for (const messageType of [undefined, "custom"]) {
  test(`no user start: ${messageType ?? "no start event"}`, async (t) => {
    const h = harness(t);
    if (messageType) await start(h, messageType);
    h.at(60_000);
    await boundary(h);
    await settle(h);
    assert.deepEqual(h.entries, []);
  });
}

test("new user request replaces the previous start", async (t) => {
  const h = harness(t);
  await start(h);
  h.at(90_000);
  await start(h); // Includes sendUserMessage: preserve the current user-run contract.
  h.at(110_000);
  await boundary(h);
  h.at(121_000);
  await settle(h);
  expectDuration(h, "31s", 121_000);
});

for (const [type, data] of [
  ["session_tree", { leafId: "other-branch" }],
  ["session_shutdown", { reason: "reload" }],
  ["session_start", { reason: "new" }],
  ["session_start", { reason: "resume" }],
  ["session_start", { reason: "fork" }],
  ["session_start", { reason: "reload" }],
]) {
  test(`${type}/${data.reason ?? "branch"} clears in-memory timing`, async (t) => {
    const h = harness(t);
    await start(h);
    h.at(20_000);
    await h.emit(type, data);
    await start(h, "custom");
    h.at(60_000);
    await boundary(h);
    await settle(h);
    assert.deepEqual(h.entries, [], "old branch/session must not produce an entry");
    await start(h);
    h.at(80_000);
    await boundary(h);
    h.at(91_000);
    await settle(h);
    expectDuration(h, "31s", 91_000);
  });
}
