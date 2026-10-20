#pragma once
#include "vehicle_memory_bindings.h"
#include <array>
#include <cmath>
#include <cstring>

namespace sector_attachment {

// Additional state changed by EEB800/ECFA80. Rigid pose, row impulses,
// deformation, tire history and contacts remain in the normal checkpoint plan.
// This adapter admits the verified independent-hub BAR branch only.
struct SuspensionBar {
    uintptr_t address = 0, bodies[2]{};
    double limits[2]{};
    unsigned char mode[2]{}, active = 0;
};
struct SuspensionCheckpoint {
    uintptr_t physics = 0, wheels[4]{}, hubs[4]{};
    std::array<uintptr_t, 32> supports{};
    size_t support_count = 0;
    unsigned constraint_count = 0;
    std::array<SuspensionBar, 64> bars{};
    bool occupied = false;
};

inline bool attachment_address(uintptr_t p, size_t size) {
    return p >= 0x10000 && size && p < UINT64_C(0x800000000000) &&
           size <= UINT64_C(0x800000000000) - p;
}
template <typename Read>
bool attachment_supports(uintptr_t physics, const RestoreBindings &bindings,
                         std::array<uintptr_t, 32> &out, size_t &count, Read read) {
    uintptr_t vector[3]{};
    if (!read(physics + 0x2440, vector) || vector[1] < vector[0] || vector[2] < vector[1] ||
        (vector[1] - vector[0]) % 8 || (vector[2] - vector[0]) % 8 ||
        !attachment_address(vector[0], vector[2] - vector[0]) || vector[2] - vector[0] > 32 * 8)
        return false;
    count = (vector[1] - vector[0]) / 8;
    if (!count)
        return false;
    out = {};
    for (size_t i = 0; i < count; ++i) {
        if (!read(vector[0] + i * 8, out[i]))
            return false;
        unsigned matches = 0;
        for (unsigned j = 0; j < bindings.body_count; ++j)
            matches += out[i] == bindings.address[j];
        if (matches != 1)
            return false;
        for (size_t j = 0; j < i; ++j)
            if (out[i] == out[j])
                return false;
    }
    return true;
}

template <typename Read>
bool capture_suspension(const RestoreBindings &bindings, SuspensionCheckpoint &out, Read read) {
    SuspensionCheckpoint next;
    next.physics = bindings.address[104];
    next.constraint_count = bindings.constraint_count;
    uintptr_t backups[3]{};
    if (!bindings.epoch || bindings.body_count > 32 || next.constraint_count > 64 ||
        !attachment_address(next.physics, 0x2658) || !read(next.physics + 0x2640, backups) ||
        backups[0] != backups[1] ||
        !attachment_supports(next.physics, bindings, next.supports, next.support_count, read))
        return false;
    for (unsigned w = 0; w < 4; ++w) {
        next.wheels[w] = bindings.address[RESTORE_WHEEL_BASE + w];
        unsigned char flags[2]{};
        if (!read(next.wheels[w] + 0x300, flags) || flags[0] || flags[1] ||
            !read(next.wheels[w] + 0x1d8, next.hubs[w]))
            return false;
    }
    for (unsigned i = 0; i < next.constraint_count; ++i) {
        if (bindings.constraint_kind[i] != 1)
            continue;
        auto &bar = next.bars[i];
        bar.address = bindings.address[RESTORE_CONSTRAINT_BASE + i];
        if (!read(bar.address + 0xa0, bar.bodies) || !read(bar.address + 0x80, bar.limits) ||
            !read(bar.address + 0x48, bar.mode) || !read(bar.address + 0x4e, bar.active) ||
            !std::isfinite(bar.limits[0]) || !std::isfinite(bar.limits[1]) || bar.limits[0] < 0 ||
            bar.limits[0] > bar.limits[1] || bar.mode[0] > 1 || bar.mode[1] > 1 || bar.active > 3)
            return false;
    }
    next.occupied = true;
    out = next;
    return true;
}

template <typename Read>
bool plan_suspension(const SuspensionCheckpoint &saved, const RestoreBindings &bindings,
                     RestorePlan &plan, unsigned &detached_mask, Read read) {
    detached_mask = 0;
    if (!saved.occupied || !plan.count || plan.count > RESTORE_MAX_FIELDS ||
        bindings.constraint_count != saved.constraint_count ||
        bindings.address[104] != saved.physics || !bindings.epoch || plan.epoch != bindings.epoch)
        return false;
    std::array<uintptr_t, 32> supports{};
    size_t count = 0;
    if (!attachment_supports(saved.physics, bindings, supports, count, read) ||
        count != saved.support_count || supports != saved.supports)
        return false;
    unsigned mask = 0;
    unsigned char flags[4][2]{};
    for (unsigned w = 0; w < 4; ++w) {
        uintptr_t hub = 0;
        if (bindings.address[RESTORE_WHEEL_BASE + w] != saved.wheels[w] ||
            !read(saved.wheels[w] + 0x300, flags[w]) || !read(saved.wheels[w] + 0x1d8, hub) ||
            hub != saved.hubs[w] || flags[w][0] > 1 || flags[w][1] > 1)
            return false;
        if (flags[w][1]) {
            // The no-hub/rear-axle branch uses a different constraint selector.
            if (!hub || flags[w][0] != 1)
                return false;
            mask |= 1u << w;
        } else if (flags[w][0])
            return false;
    }
    uintptr_t vector[3]{};
    if (!read(saved.physics + 0x2640, vector))
        return false;
    if (!mask)
        return vector[0] == vector[1];
    if (vector[1] <= vector[0] || vector[2] < vector[1] || (vector[1] - vector[0]) % 56 ||
        (vector[2] - vector[0]) % 56 || !attachment_address(vector[0], vector[2] - vector[0]) ||
        vector[2] - vector[0] > 64 * 56)
        return false;
    struct Backup {
        uintptr_t constraint;
        double parameters[6];
    };
    static_assert(sizeof(Backup) == 56);
    std::array<bool, 64> selected{}, recorded{};
    unsigned covered = 0;
    size_t selected_count = 0;
    for (unsigned i = 0; i < saved.constraint_count; ++i) {
        const auto &bar = saved.bars[i];
        if (!bar.address)
            continue;
        uintptr_t pair[2]{};
        if (bindings.constraint_kind[i] != 1 ||
            bindings.address[RESTORE_CONSTRAINT_BASE + i] != bar.address ||
            !read(bar.address + 0xa0, pair) || std::memcmp(pair, bar.bodies, sizeof(pair)))
            return false;
        for (unsigned w = 0; w < 4; ++w) {
            if (!(mask & (1u << w)))
                continue;
            for (size_t j = 0; j < count; ++j)
                if ((pair[0] == saved.hubs[w] && pair[1] == supports[j]) ||
                    (pair[1] == saved.hubs[w] && pair[0] == supports[j])) {
                    selected[i] = true;
                    covered |= 1u << w;
                }
        }
        selected_count += selected[i];
    }
    if (covered != mask || selected_count != (vector[1] - vector[0]) / 56 ||
        plan.count > RESTORE_MAX_FIELDS - (selected_count * 3 + 5))
        return false;
    for (size_t j = 0; j < selected_count; ++j) {
        Backup backup{};
        if (!read(vector[0] + j * 56, backup))
            return false;
        unsigned i = 0;
        while (i < saved.constraint_count && saved.bars[i].address != backup.constraint)
            ++i;
        if (i == saved.constraint_count || !selected[i] || recorded[i])
            return false;
        const auto &bar = saved.bars[i];
        // The native backup stores limits in parameters 0 and 3. Parameters
        // belonging to other constraint axes are zero for this BAR branch.
        if (backup.parameters[0] != bar.limits[0] || backup.parameters[3] != bar.limits[1] ||
            backup.parameters[1] != 0 || backup.parameters[2] != 0 || backup.parameters[4] != 0 ||
            backup.parameters[5] != 0)
            return false;
        recorded[i] = true;
    }
    const auto original_count = plan.count;
    auto append = [&](unsigned slot, unsigned offset, const auto &desired) {
        if (plan.count >= RESTORE_MAX_FIELDS)
            return false;
        auto &entry = plan.fields[plan.count];
        entry = {};
        entry.object_slot = slot;
        entry.field_offset = offset;
        entry.size = sizeof(desired);
        for (unsigned i = 0; i < plan.count; ++i) {
            const auto &old = plan.fields[i];
            if (old.object_slot == slot && old.field_offset < offset + entry.size &&
                offset < old.field_offset + old.size)
                return false;
        }
        // Read into a typed value: callbacks deliberately have no arbitrary
        // remote-memory write capability.
        auto expected = desired;
        if (!read(bindings.address[slot] + offset, expected))
            return false;
        std::memcpy(entry.expected, &expected, entry.size);
        std::memcpy(entry.desired, &desired, entry.size);
        ++plan.count;
        return true;
    };
    for (unsigned i = 0; i < saved.constraint_count; ++i) {
        if (!selected[i])
            continue;
        const auto &bar = saved.bars[i];
        std::array<double, 2> limits{};
        std::array<unsigned char, 2> mode{};
        unsigned char active = 0;
        if (!read(bar.address + 0x80, limits) || !read(bar.address + 0x48, mode) ||
            !read(bar.address + 0x4e, active) || !std::isinf(limits[0]) ||
            !std::signbit(limits[0]) || !std::isinf(limits[1]) || std::signbit(limits[1]) ||
            mode[0] || mode[1] || active ||
            !append(RESTORE_CONSTRAINT_BASE + i, 0x80,
                    std::array<double, 2>{bar.limits[0], bar.limits[1]}) ||
            !append(RESTORE_CONSTRAINT_BASE + i, 0x48,
                    std::array<unsigned char, 2>{bar.mode[0], bar.mode[1]}) ||
            !append(RESTORE_CONSTRAINT_BASE + i, 0x4e, bar.active)) {
            plan.count = original_count;
            return false;
        }
    }
    for (unsigned w = 0; w < 4; ++w)
        if ((mask & (1u << w)) &&
            !append(RESTORE_WHEEL_BASE + w, 0x300, std::array<unsigned char, 2>{0, 0})) {
            plan.count = original_count;
            return false;
        }
    // Empty the native backup vector without releasing its allocation. The
    // transaction restores its end pointer on failure, including all records.
    if (!append(104, 0x2648, vector[0])) {
        plan.count = original_count;
        return false;
    }
    detached_mask = mask;
    return true;
}
} // namespace sector_attachment
