#ifndef SECTOR_BODYWORK_RESTORE_25661166_H
#define SECTOR_BODYWORK_RESTORE_25661166_H

#include <cstddef>
#include <cstdint>
#include <memory>

namespace sector_bodywork {

// This backend must pin the graphics component allocation as well as the player
// lifetime. The existing physics-only pin is not sufficient. No game functions
// are called here. The v21 host supplies both pins and the component locks.
struct Backend {
    void *user;
    bool (*pinned)(void *);
    // Changes on player or graphics reconstruction, including address reuse.
    uint64_t (*generation)(void *);
    bool (*read)(void *, uintptr_t, void *, size_t);
    bool (*write)(void *, uintptr_t, const void *, size_t);
    bool (*try_lock)(void *, uintptr_t);
    void (*unlock)(void *, uintptr_t);
};

enum class Result {
    ok,
    invalid_backend,
    not_pinned,
    busy,
    bad_layout,
    unsupported_buffer,
    damaged_checkpoint,
    topology_changed,
    read_failed,
    write_failed,
    recovery_failed,
    allocation_failed,
    wrong_phase,
};

enum class LayoutCheck : uint64_t {
    none = 0,
    graphics_root_range = 1,
    component_count = 2,
    component_array_range = 3,
    damage_value = 4,
    replay_component = 5,
    dirty_flag = 6,
    damage_event_count = 7,
    part_count = 8,
    part_array_range = 9,
    mesh_object_range = 10,
    vertex_count = 11,
    vertex_budget = 12,
    submesh_count = 13,
    vertex_buffer_range = 14,
    original_buffer_range = 15,
    submesh_array_range = 16,
    overlapping_restore_spans = 17,
};

struct Report {
    Result result = Result::ok;
    size_t components = 0;
    size_t meshes = 0;
    size_t vertex_bytes = 0;
    size_t attempted_writes = 0;
    size_t verified_writes = 0;
    size_t recovery_writes = 0;
    // One-based indices; zero means the failure is outside a component/mesh.
    uint64_t check = 0, component_index = 0, mesh_index = 0, mesh_flags = 0;
    int64_t observed = 0, limit = 0;
};

// Addresses and bytes are held outside the physical snapshot ABI. Copying a
// checkpoint is intentionally prohibited; capture publishes by move on success.
class Checkpoint {
  public:
    Checkpoint();
    ~Checkpoint();
    Checkpoint(Checkpoint &&) noexcept;
    Checkpoint &operator=(Checkpoint &&) noexcept;
    Checkpoint(const Checkpoint &) = delete;
    Checkpoint &operator=(const Checkpoint &) = delete;

  private:
    struct Data;
    std::unique_ptr<Data> data_;
    friend class Transaction;
};

class Transaction {
  public:
    explicit Transaction(Backend backend);
    ~Transaction();
    Transaction(const Transaction &) = delete;
    Transaction &operator=(const Transaction &) = delete;

    // Capture only healthy, fully constructed CPU buffers. A failed replacement
    // leaves the previously published checkpoint intact.
    Result capture(uintptr_t graphics, Checkpoint &checkpoint);

    // Begin takes nonblocking component locks, validates all topology and saves
    // pre-restore bytes. It performs no writes. Locks remain held until finish.
    Result begin(uintptr_t graphics, const Checkpoint &checkpoint);
    Result apply();
    Result rollback();
    // Commit only after the physical transaction and its contact rebuild pass.
    // Passing false restores the graphics journal before releasing its locks.
    Result finish(bool commit);
    const Report &report() const;

  private:
    struct Work;
    std::unique_ptr<Work> work_;
};

} // namespace sector_bodywork
#endif
