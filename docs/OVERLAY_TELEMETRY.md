# Overlay telemetry

The SDK reader targets 60 samples per second. A high-resolution waitable timer
uses absolute deadlines, including the time spent copying and serializing each
frame. Missed deadlines are skipped. The SDK lock is released before JSON
serialization and timer waits. No vehicle state is written.

Electron forwards each frame. Overlay windows apply the latest received frame
on the next animation frame, so queued IPC updates cannot trigger multiple
renders within a display frame. Actual visible cadence depends on the display,
game telemetry availability and system load.

## Leaderboard and Relative gaps

Scoring and vehicle telemetry can update at different rates. Between scoring
samples, Sector projects each car's measured displacement onto its last scored
forward axis. Relative uses that movement to adjust track-distance separation.
Leaderboard applies the short change in separation to the official class gap,
using the leader's forward speed. Each scoring update replaces the anchor;
estimates never accumulate across scoring frames.

Estimated gaps are marked with `~`. Lap deficits remain lap deficits. Missing,
stale, mismatched, pit, invalid or discontinuous telemetry retains the scoring
value. Race-gap estimation also excludes stopped and reversing cars. Samples
must be within 0.5 seconds of scoring and within 0.05 seconds of each other;
movement is bounded and large heading changes are rejected. These are short
estimates, not official timing-loop measurements.

## Verification

The native self-test covers projection, stale samples, discontinuities, heading
changes and non-finite data. `--test-cadence` measured 59.99 Hz over 120 deadlines.
A five-second SDK read with LMU paused measured 59.20 output frames per second;
the game timestamps did not advance, so this measures reader cadence only.
Model tests cover changes between scoring samples, re-anchoring, lap wrap,
missing data and the actual Leaderboard/Relative output. A live driving check
of the new gap estimates remains separate from the bodywork reset test.
