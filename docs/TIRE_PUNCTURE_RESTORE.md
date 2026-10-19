# Experimental puncture restoration

Sector 0.2.19 / native v27 restores the tire state recorded by F6 when F7 is
used after a puncture. This is implemented and covered by local fixtures, but
has not yet been verified in LMU. A healthy checkpoint is required. Detached
wheels and replaced assemblies remain outside this restore contract.

## Evidence

The retained 0.2.4 impact recording contains a rear-right puncture while that
wheel remained attached. In `work/impact-capture-024b`, frames 1 and 2 show the
wheel's `+0x3e0` flag changing from 0 to 1, pressure cache `+0x3b8` falling to
zero, and SDK `flat` changing to true. These asynchronous observations identify
the transition, but do not by themselves define its complete state.

Static inspection of the retained Steam 25661166 live-code image establishes
the native mutation path. The image is the same hash-pinned analysis artifact
used for the lap-scoring investigation; raw game code and captures are not
distributed in this repository.

- `EE4760` sets wheel `+0x3e0` and calls `F115F0` through wheel `+0x3e8`.
- `F115F0` sets tire `+8`, changes pressure-related state and model response,
  scales nine rows through tire `+0xef0`, then rewrites allocated tread caches
  through tire `+0x318`, with count at `+0x310`.
- The model scales include 0.125 for response coefficients, 0.25 for float
  lookup entries, 2 for two row coefficients and 0.5 for another coefficient.
  The implementation saves original values instead of trying to invert these
  operations after repeated damage.
- `EE4B20` updates the wheel pressure/wear projections from the tire model.

## Transaction coverage

The existing checkpoint already includes tire `+0xfb8`, thermal coefficients,
selected tread history and mechanical state. The additional state includes:

| Object | Added fields |
| --- | --- |
| Wheel | Puncture flag `+0x3e0`, pressure `+0x3b8`, wear projection `+0x3c8` |
| Tire | Puncture flag `+8`, gas state `+0xfa0/+0xfa8`, coefficients `+0xc90..0xcc8`, response `+0x1088..0x10b0` |
| Nine lookup rows | Two doubles at `+0x1b0`, one at `+0x1f0`, 1,716 floats at `+0x1f8` per row |
| Tread pool | Coefficients `+0x30..0x58` and history `+0x100/+0x108` |

Selected tread nodes already have several fields in the thermal plan. Their
additional entries cover only `+0x38/+0x108`, preventing overlapping writes.
Other allocated nodes receive the complete bounded coefficient/history ranges.
With 504 selected nodes per tire, this adds 6,076 fields. A plan which does not
fit the existing transaction capacity is rejected before writing.

All entries share expected-value preflight, readback and compensation with the
physical transaction. Pointer values are identity checks and live bindings,
never restored values. Changed tables, pools, node counts or material tokens
reject preparation. Nonfinite model values, mismatched puncture flags and
out-of-range counts reject capture. A rejected replacement keeps the last
complete checkpoint. The native contact rebuild still follows the transaction.

## Manual check still required

1. Quit the previous Sector build and restart LMU without EAC.
2. Open 0.2.19, enter offline Practice and DRIVE with attached, healthy tires.
3. Press F6 once and wait for the checkpoint confirmation.
4. Produce one puncture without detaching a wheel. Once the impact ends, press
   F7 once. Check position, tire pressure, the puncture indicator and handling.
5. Repeat a puncture and restore using the same checkpoint. A repeated repair
   must not progressively change grip or tire response.
6. Export diagnostics if capture or restore is refused. No live trial was run
   while preparing this build, because the user was unavailable.

The finish-line timing check from 0.2.18 is also still pending. Saving before
the line must allow the first timed lap; restoring that checkpoint and crossing
again must start the next attempt while leaving the interrupted attempt untimed.
