import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeDistance, leaderboardGap } from "../shared/live-gaps.cjs";

const car = (distance, behind, travel, speed = 50, et = 100.2) => ({
  distance,
  behind,
  liveProgress: { travel, speed, et },
});

test("gaps follow measured movement between scoring samples", () => {
  const leader = car(300, 0, 10),
    follower = car(200, 2, 8, 40);
  assert.equal(relativeDistance(leader, follower, 100, 1000), 102);
  assert.deepEqual(leaderboardGap(follower, leader, 100), {
    value: 2.04,
    estimated: true,
  });
  leader.liveProgress = { et: 100.3, travel: 15, speed: 50 };
  follower.liveProgress = { et: 100.3, travel: 12, speed: 40 };
  assert.equal(relativeDistance(leader, follower, 100, 1000), 103);
  assert.equal(leaderboardGap(follower, leader, 100).value, 2.06);
  // Fresh scoring replaces the anchor. No accumulation from the old estimate.
  leader.liveProgress.travel = follower.liveProgress.travel = 0;
  follower.behind = 2.1;
  assert.deepEqual(leaderboardGap(follower, leader, 100.3), {
    value: 2.1,
    estimated: false,
  });
});

test("missing, stale, mismatched and pit samples retain the scored gap", () => {
  for (const patch of [
    null,
    { et: 99.9, travel: 10, speed: 50 },
    { et: 100.6, travel: 10, speed: 50 },
    { et: 100.3, travel: 10, speed: 50 },
    { et: 100.2, travel: NaN, speed: 50 },
    { et: 100.2, travel: 101, speed: 50 },
  ]) {
    const leader = car(300, 0, 10),
      follower = car(200, 2, 8);
    follower.liveProgress = patch;
    assert.equal(relativeDistance(leader, follower, 100, 1000), 100);
    assert.deepEqual(leaderboardGap(follower, leader, 100), {
      value: 2,
      estimated: false,
    });
  }
  const leader = car(300, 0, 10),
    follower = car(200, 2, 8);
  follower.pit = true;
  assert.equal(relativeDistance(leader, follower, 100, 1000), 100);
  assert.equal(leaderboardGap(follower, leader, 100).estimated, false);
});

test("relative wraps at the line; stopped and reversing cars do not produce race-gap extrapolation", () => {
  const leader = car(5, 0, 10),
    follower = car(995, 1, 5);
  assert.equal(relativeDistance(leader, follower, 100, 1000), 15);
  assert.equal(relativeDistance(follower, leader, 100, 1000), -15);
  for (const speed of [0, -40]) {
    follower.liveProgress.speed = speed;
    assert.deepEqual(leaderboardGap(follower, leader, 100), {
      value: 1,
      estimated: false,
    });
  }
  assert.equal(relativeDistance({ distance: null }, follower, 100, 1000), null);
  assert.equal(leaderboardGap({ behind: null }, leader, 100).value, null);
});
