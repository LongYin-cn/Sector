import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resetAccess } from "../main/reset-access.cjs";
import { selectGames } from "../main/runtime.cjs";
import model from "../shared/overlay-model.cjs";
import config from "../shared/overlay-config.cjs";

test("public telemetry discovery includes EAC-protected games without admitting them to reset", () => {
  const install = path.resolve("fixture-game");
  const protectedGame = {
    pid: 42,
    identity: null,
    executable: null,
    eac: true,
  };
  assert.deepEqual(selectGames([protectedGame], install, true), [
    protectedGame,
  ]);
  assert.deepEqual(selectGames([protectedGame], install), []);
  const offline = {
    pid: 43,
    identity: "43:1",
    executable: path.join(install, "Le Mans Ultimate.exe"),
    eac: false,
  };
  assert.deepEqual(selectGames([offline], install), [offline]);
  // Preserve ambiguity: the global SDK mapping must not silently pick one game.
  assert.equal(selectGames([protectedGame, offline], install, true).length, 2);
});

test("online, EAC, unavailable and unknown session contexts never admit the reset listener", async () => {
  let requests = 0;
  assert.equal(
    (
      await resetAccess({ eac: true }, async () => {
        requests++;
      })
    ).allowed,
    false,
  );
  assert.equal(requests, 0);
  for (const state of [
    null,
    {},
    { settingMode: "SETTING_MULTIPLAYER", gameSession: "PRACTICE1" },
    { settingMode: "SETTING_GRANDPRIX", gameSession: "RACE" },
  ]) {
    assert.equal(
      (
        await resetAccess({}, async () => ({
          ok: true,
          json: async () => ({ state }),
        }))
      ).allowed,
      false,
    );
  }
  assert.equal(
    (
      await resetAccess({}, async () => {
        throw new Error("Offline");
      })
    ).allowed,
    false,
  );
  const allowed = await resetAccess({ eac: false }, async (url, options) => {
    assert.equal(url, "http://127.0.0.1:6397/navigation/state");
    assert.equal(options.redirect, "error");
    return {
      ok: true,
      json: async () => ({
        state: { settingMode: "SETTING_GRANDPRIX", gameSession: "PRACTICE1" },
      }),
    };
  });
  assert.equal(allowed.allowed, true);
});

test("online scoring without opponent physics still renders standings and gaps", () => {
  const raw = {
    connected: true,
    driving: true,
    foreground: true,
    session: 10,
    track: "Fixture",
    et: 100,
    length: 1000,
    player: { id: 1, et: 100, lap: 1, lapStart: 0, speed: 80 },
    cars: [
      {
        id: 2,
        place: 1,
        class: "LMGT3",
        name: "Online opponent",
        laps: 1,
        lapsBehind: 0,
        behind: 0,
        distance: 200,
      },
      {
        id: 1,
        player: true,
        place: 2,
        class: "LMGT3",
        laps: 1,
        lapsBehind: 0,
        behind: 2,
        distance: 100,
        estimated: 100,
      },
    ],
  };
  const frame = new model.TelemetryModel().update(raw);
  const settings = config.defaults().widgets;
  const board = model.valuesFor("leaderboard", frame, settings.leaderboard);
  assert.equal(board.classes[0].rows[0].name, "Online opponent");
  assert.equal(board.classes[0].rows[1].gap, "+2.000");
  assert.equal(
    model.valuesFor("relative", frame, settings.relative).rows.length,
    2,
  );
});
