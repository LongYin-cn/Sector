#ifndef LMU_VEHICLE_RESTORE_ADAPTER_25661166_H
#define LMU_VEHICLE_RESTORE_ADAPTER_25661166_H
#include "vehicle_state_reader.h"
#include "contact_rebuild.h"
#include "bodywork_checkpoint.h"
#include "../runtime/graphics_lifetime.h"
extern "C" {
#include "../runtime/active_reset_native.h"
}

struct VehicleContactSample {
    uintptr_t tire;
    double dt, horizon, angular;
    uintptr_t world;
    DWORD thread;
    uint64_t tick_ms, epoch;
};

// These values must be captured on the nominated physics thread. The host must
// keep every object pinned across bind, save/prepare and restore completion.
struct VehicleRestoreContext {
    ResetIdentity identity;
    uint64_t epoch;
    uintptr_t physics;
    double simulation_time;
    VehicleContactSample contacts[4];
};

struct VehicleRestoreHost {
    uintptr_t module_base, native_lock, control_lock;
    DWORD owner_thread;
    void *user;
    int (*pinned)(void *, const VehicleRestoreContext *);
    void(WINAPI *refresh)(void *, double, double, void *, double);
    // Optional for older hosts; v15 rebuilds collision caches after typed restore.
    uintptr_t collision_vehicle = 0;
    int (*rebuild_collision)(void *, uintptr_t) = nullptr;
    uintptr_t graphics = 0;
    GraphicsLifetime *graphics_lifetime = nullptr;
    // Must quarantine the host fence if graphics finalization cannot complete.
    void (*finalization_failed)(void *) = nullptr;
    // Explicit opt-in by a host that owns both simulation locks and graphics
    // lifetime while changing detached component registries.
    bool restore_detached_wheels = false;
};

struct VehicleRestoreAdapter;
// Stable diagnostic codes carried by the existing IPC cause field.
enum class VehicleCaptureCause : uint64_t {
    none = 0,
    identity = 93001,
    owner = 93002,
    physical_state = 93003,
    aero_state = 93004,
    aero_damage = 93005,
    wheel_deformation = 93006,
    hinge_axes = 93007,
    checkpoint = 93008,
    contact_sample = 93009,
    contact_state = 93010,
    scoring_sector = 93011,
    collision_state = 93012,
    puncture_state = 93013,
    punctured_checkpoint = 93014,
    attachment_state = 93015,
    attachment_registry = 93016,
};
VehicleRestoreAdapter *vehicle_restore_adapter_create(const VehicleRestoreHost *);
void vehicle_restore_adapter_destroy(VehicleRestoreAdapter *);
bool vehicle_restore_adapter_bind(VehicleRestoreAdapter *, const VehicleRestoreContext *);
ResetNativeAdapter vehicle_restore_adapter_ops(VehicleRestoreAdapter *);
ContactBatchReport vehicle_restore_adapter_contact_report(const VehicleRestoreAdapter *);
sector_bodywork::Report vehicle_restore_adapter_bodywork_report(const VehicleRestoreAdapter *);
VehicleCaptureCause vehicle_restore_adapter_capture_cause(const VehicleRestoreAdapter *);

#ifdef LMU_VEHICLE_ADAPTER_FIXTURE
// Test-only dependency substitution; absent from the production object.
using VehicleFixtureReader = bool (*)(uintptr_t, uintptr_t, uint64_t, double, SnapshotFrame *,
                                      RestoreBindings *);
void vehicle_restore_adapter_fixture_reader(VehicleRestoreAdapter *, VehicleFixtureReader,
                                            uintptr_t scoring);
#endif
#endif
