#pragma once
#include "vehicle_memory_bindings.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <vector>
#include <new>

namespace sector_puncture {
// Steam 25661166: EE4760 sets the wheel flag and F115F0 changes the
// tire model, its nine lookup rows and every allocated tread-node cache.
// Store original values, rather than dividing by the native damage factors.
constexpr unsigned row_count = 9, row_stride = 0x1cc8, lookup_count = 1716;
constexpr unsigned max_nodes = 256 * 7, node_stride = 0x110;
struct Row {
    double stiffness[2], damping;
    std::array<float, lookup_count> lookup;
};
struct Node {
    double coefficients[6]; // +0x30 through +0x58
    uint64_t history[2];    // +0x100 and +0x108, copied without reinterpretation
};
struct Tire {
    unsigned char wheel_flat = 0, model_flat = 0;
    double pressure = 0, wear = 0, gas[2]{}, model[8]{}, response[6]{};
    uintptr_t tire = 0, table = 0, pool = 0;
    uint64_t material_token = 0;
    std::array<Row, row_count> rows{};
    std::vector<Node> nodes;
};
using State = std::array<Tire, 4>;

template <typename T, size_t N> bool finite(const T (&values)[N]) {
    for (auto value : values)
        if (!std::isfinite(value))
            return false;
    return true;
}
inline bool address(uintptr_t value, size_t bytes) {
    return value >= 0x10000 && value < UINT64_C(0x800000000000) - bytes;
}
template <typename Read> bool capture(const RestoreBindings &bindings, State &out, Read read) {
    try {
        State next;
        for (unsigned w = 0; w < 4; ++w) {
            auto &t = next[w];
            const auto wheel = bindings.address[RESTORE_WHEEL_BASE + w];
            t.tire = bindings.address[RESTORE_TIRE_BASE + w];
            uint32_t count = 0;
            if (!read(wheel + 0x3e0, t.wheel_flat) || !read(t.tire + 8, t.model_flat) ||
                t.wheel_flat > 1 || t.model_flat > 1 || t.wheel_flat != t.model_flat ||
                !read(wheel + 0x3b8, t.pressure) || !read(wheel + 0x3c8, t.wear) ||
                !std::isfinite(t.pressure) || !std::isfinite(t.wear) ||
                !read(t.tire + 0xfa0, t.gas) || !finite(t.gas) || !read(t.tire + 0xc90, t.model) ||
                !finite(t.model) || !read(t.tire + 0x1088, t.response) || !finite(t.response) ||
                !read(t.tire + 0xef0, t.table) || !address(t.table, row_count * row_stride) ||
                !read(t.tire + 0x318, t.pool) || !read(t.tire + 0x310, count) || !count ||
                count > max_nodes || !address(t.pool, count * node_stride) ||
                !read(t.tire + 0x9e8, t.material_token))
                return false;
            for (unsigned i = 0; i < row_count; ++i) {
                auto &r = t.rows[i];
                const auto p = t.table + i * row_stride;
                if (!read(p + 0x1b0, r.stiffness) || !finite(r.stiffness) ||
                    !read(p + 0x1f0, r.damping) || !std::isfinite(r.damping) ||
                    !read(p + 0x1f8, r.lookup))
                    return false;
                for (float value : r.lookup)
                    if (!std::isfinite(value))
                        return false;
            }
            t.nodes.resize(count);
            for (unsigned i = 0; i < count; ++i) {
                auto &n = t.nodes[i];
                if (!read(t.pool + i * node_stride + 0x30, n.coefficients) ||
                    !finite(n.coefficients) || !read(t.pool + i * node_stride + 0x100, n.history))
                    return false;
            }
        }
        out = std::move(next);
        return true;
    } catch (const std::bad_alloc &) {
        return false;
    }
}
inline bool healthy(const State &state) {
    for (const auto &t : state)
        if (t.wheel_flat || t.model_flat)
            return false;
    return true;
}

inline bool append(RestorePlan &plan, unsigned slot, unsigned offset, const void *before,
                   const void *after, unsigned bytes) {
    if (plan.count == RESTORE_MAX_FIELDS || !bytes || bytes > RESTORE_FIELD_BYTES)
        return false;
    auto &f = plan.fields[plan.count++];
    f = {};
    f.object_slot = slot;
    f.field_offset = offset;
    f.size = bytes;
    std::memcpy(f.expected, before, bytes);
    std::memcpy(f.desired, after, bytes);
    return true;
}

// The selected tread nodes already have +0x30, +0x40..58 and +0x100
// in the thermal plan. Add only missing fields there, avoiding overlap.
inline bool plan(const State &saved, const State &current, RestoreBindings &bindings,
                 RestorePlan &out) {
    const auto initial = out.count;
    auto add = [&](unsigned slot, unsigned offset, const void *a, const void *b, unsigned n) {
        return append(out, slot, offset, a, b, n);
    };
    for (unsigned w = 0; w < 4; ++w) {
        const auto &s = saved[w], &c = current[w];
        if (s.tire != c.tire || s.table != c.table || s.pool != c.pool ||
            s.nodes.size() != c.nodes.size() || s.material_token != c.material_token)
            goto failed;
        // Include all four tires so regular resets restore their saved model
        // state too, including pressure and caches which change without a flat.
        if (!add(100 + w, 0x3e0, &c.wheel_flat, &s.wheel_flat, 1) ||
            !add(100 + w, 0x3b8, &c.pressure, &s.pressure, 8) ||
            !add(100 + w, 0x3c8, &c.wear, &s.wear, 8) ||
            !add(96 + w, 8, &c.model_flat, &s.model_flat, 1) ||
            !add(96 + w, 0xfa0, c.gas, s.gas, 16) || !add(96 + w, 0xc90, c.model, s.model, 64) ||
            !add(96 + w, 0x1088, c.response, s.response, 48))
            goto failed;
        for (unsigned r = 0; r < row_count; ++r) {
            const auto slot = RESTORE_PUNCTURE_TABLE_BASE + w * row_count + r;
            bindings.address[slot] = c.table + r * row_stride;
            if (!add(slot, 0x1b0, c.rows[r].stiffness, s.rows[r].stiffness, 16) ||
                !add(slot, 0x1f0, &c.rows[r].damping, &s.rows[r].damping, 8))
                goto failed;
            for (unsigned offset = 0; offset < lookup_count * sizeof(float); offset += 128) {
                const auto n = std::min(128u, unsigned(lookup_count * sizeof(float)) - offset);
                if (!add(slot, 0x1f8 + offset,
                         reinterpret_cast<const unsigned char *>(c.rows[r].lookup.data()) + offset,
                         reinterpret_cast<const unsigned char *>(s.rows[r].lookup.data()) + offset,
                         n))
                    goto failed;
            }
        }
        bindings.address[RESTORE_PUNCTURE_POOL_BASE + w] = c.pool;
        bindings.puncture_nodes[w] = static_cast<uint32_t>(c.nodes.size());
        for (unsigned i = 0; i < c.nodes.size(); ++i) {
            bool selected = false;
            const auto node = c.pool + i * node_stride;
            for (unsigned row = 0; row < 72; ++row)
                for (unsigned k = 0; k < 7; ++k)
                    selected |=
                        bindings.address[RESTORE_THERMAL_BASE + (w * 72 + row) * 9 + k] == node;
            const auto slot = RESTORE_PUNCTURE_POOL_BASE + w;
            const auto &a = c.nodes[i], &b = s.nodes[i];
            if (selected) {
                if (!add(slot, i * node_stride + 0x38, a.coefficients + 1, b.coefficients + 1, 8) ||
                    !add(slot, i * node_stride + 0x108, a.history + 1, b.history + 1, 8))
                    goto failed;
            } else if (!add(slot, i * node_stride + 0x30, a.coefficients, b.coefficients, 48) ||
                       !add(slot, i * node_stride + 0x100, a.history, b.history, 16))
                goto failed;
        }
    }
    return true;
failed:
    out.count = initial;
    return false;
}
} // namespace sector_puncture
