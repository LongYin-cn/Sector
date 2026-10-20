#ifndef LMU_WHEEL_RESTORE_CORE_H
#define LMU_WHEEL_RESTORE_CORE_H
#include "rigid_restore_core.h"

/* Owned values without native pointers. Saved checkpoints must be attached;
 * explicit observation validators also handle deformation and detachment.
 * Parent identity and suspension constraints must be resolved by the adapter.
 */
typedef struct WheelSavedSpin {
    double angle;
    double angular_rate;
    unsigned int attached;
    unsigned int deformed;
} WheelSavedSpin;

typedef struct WheelPreparedSpin {
    WheelSavedSpin spin;
    double orientation[9];
    double angular_velocity_world[3];
    double angular_momentum_world[3];
    double inverse_inertia_world[6];
} WheelPreparedSpin;

/* Axis-angle deformation vector and accumulated suspension damage, in native
 * wheel coordinates. Kept outside the legacy snapshot/observer ABI. */
typedef struct WheelDeformation {
    double rotation[3];
    double accumulated;
} WheelDeformation;

RigidPrepareResult wheel_prepare_deformed_spin(const WheelSavedSpin[4], const WheelDeformation[4],
                                               const RigidSavedBody[4],
                                               const RigidMassProperties[4], WheelPreparedSpin[4]);
RigidPrepareResult wheel_validate_deformed_state(const WheelSavedSpin[4], const WheelDeformation[4],
                                                 const RigidSavedBody[4], const RigidSavedBody[4]);
/* Observation only. Detached bodies must still be finite rigid states, but
 * no longer share the hub's spin transform. This does not authorize repair. */
RigidPrepareResult wheel_validate_detached_state(const WheelSavedSpin[4], const WheelDeformation[4],
                                                 const RigidSavedBody[4], const RigidSavedBody[4],
                                                 unsigned detached_mask);

/* Prepare all FOUR wheel bindings, publishing nothing on any failure.
 * Rebuild rotation, omega, L and world inertia from saved parent and spin.
 * Local math only: does not write LMU, rebuild contacts, or restore tire,
 * suspension, drivetrain, fuel, damage, thermal or hybrid histories.
 */
RigidPrepareResult wheel_prepare_spin(const WheelSavedSpin saved[4], const RigidSavedBody hubs[4],
                                      const RigidMassProperties wheel_mass[4],
                                      WheelPreparedSpin output[4]);

/* Reject a saved snapshot whose wheel pose/omega disagrees with its hub/spin.
 * This catches phase mismatch, but is not a replacement for thread ownership.
 * Output is published only after all four saved bodies agree within 1e-8.
 */
RigidPrepareResult wheel_prepare_consistent_checkpoint(const WheelSavedSpin saved[4],
                                                       const RigidSavedBody hubs[4],
                                                       const RigidSavedBody wheels[4],
                                                       WheelPreparedSpin output[4]);
#endif
