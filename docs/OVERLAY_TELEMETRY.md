# Overlay telemetry

## Online sessions and EAC

From 0.2.13, public telemetry discovery is independent of Active Reset admission.
The overlay reader enumerates process names to track the selected PID and opens
only the SDK's `LMU_Data` mapping for reading. It does not open a handle to LMU,
read process memory or load a module into the game. SDK synchronization uses the
SDK's lock protocol. The Sector parent handle only controls reader lifetime.

Protected process paths and start times are optional for overlays; multiple
running LMU instances remain ambiguous and are rejected. Active Reset still
requires the selected installation, a stable process identity, no EAC and
positive offline Practice context before starting its listener. The native
runner retains its own checks. Missing or unknown context never admits reset.

Online opponent data may contain scoring without individual physics or resource
readings. Standings and scored gaps remain available; missing readings are not
invented. Automated discovery, admission and scoring-only fixtures pass. Live
validation in an EAC-enabled online session is pending.

The SDK reader follows the refresh rate of the display selected for overlays,
including fractional rates such as 59.94 Hz. If that display disappears, it uses
the primary display. If Windows does not report a usable rate, it uses 60 Hz.
Display selection and configuration changes update the running reader through
its control pipe without restarting it. The rate is also checked once a second.
A high-resolution waitable timer
uses absolute deadlines, including the time spent copying and serializing each
frame. Missed deadlines are skipped. The SDK lock is released before JSON
serialization and timer waits. No vehicle state is written.

Electron forwards each frame. Overlay windows apply the latest received frame
on the next animation frame, so queued IPC updates cannot trigger multiple
renders within a display frame. Actual visible cadence depends on the display,
game telemetry availability and system load.

## Pause and reset visibility

The SDK paused phase hides overlay windows as soon as it is received. If LMU
leaves a frozen mapping instead, driving telemetry expires after 300 ms, with a
50 ms watchdog. Scoring has a separate 1.5-second timeout so its lower update
rate does not make driving widgets blink. Session telemetry at the pit monitor
continues to use the scoring timeout.

F7 no longer clears the displayed frame. The next telemetry sample replaces it,
while lap, tyre and hybrid histories reset normally. The listener publishes a
structured pending action so brief restore stalls can retain the last frame for
up to one second. Repeated pending reports do not extend this deadline. Explicit
pause, lost foreground and disconnection still hide the widgets.

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
changes, non-finite data, fragmented rate commands and pause serialization.
`--test-cadence 144` measured 143.99 Hz; `--test-cadence 59.94` measured 59.93 Hz.
The earlier fixed-rate `--test-cadence` measured 59.99 Hz over 120 deadlines.
A five-second SDK read with LMU paused measured 59.20 output frames per second;
the game timestamps did not advance, so this measures reader cadence only.
Model tests cover changes between scoring samples, re-anchoring, lap wrap,
missing data and the actual Leaderboard/Relative output. A live driving check
of the new gap estimates remains separate from the bodywork reset test.

Timing regressions cover pause, resume, stalled scoring, restore handoff,
deadline expiry, reader exit and monitor-rate changes. The Electron smoke test
checks native window visibility through F7, pause and resume, and selection of
a display with a different refresh rate. These are isolated tests; a live game
check of the new pause and F7 visibility remains pending.
