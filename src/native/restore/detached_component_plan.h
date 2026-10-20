#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

namespace sector_attachment {

// A read-only reconstruction of the wheel branch of F6DE50/FEF5A0.
// The caller must pin the vehicle and collision registries throughout planning.
// This module does not call the game, write memory or authorize a restore.
struct RegistryPatch {
    uintptr_t address = 0;
    unsigned size = 0;
    std::array<unsigned char, 8> before{}, after{};
};
struct RegistryReader {
    void *user = nullptr;
    bool (*read)(void *, uintptr_t, void *, size_t) = nullptr;
};

class RegistryPlanner {
  public:
    explicit RegistryPlanner(RegistryReader reader) : reader_(reader) {}

    bool wheels(uintptr_t module, uintptr_t collision_vehicle, unsigned mask,
                std::vector<RegistryPatch> &out) {
        out.clear();
        patches_.clear();
        budget_ = 0;
        visited_ = 0;
        base_ = module;
        vehicle_ = collision_vehicle;
        if (!reader_.read || !range(module, 0x3b8b500) || !range(collision_vehicle, 0x18b52) ||
            !mask || mask > 15)
            return false;
        int32_t car = -1;
        uintptr_t table = 0;
        if (!get(vehicle_ + 8, car) || car < 0 || car >= 104 || !get(base_ + 0x3b8aa80, table) ||
            !range(table, (unsigned(car) + 1) * 160))
            return false;
        table_ = table + unsigned(car) * 160;
        for (unsigned wheel = 0; wheel < 4; ++wheel) {
            unsigned char flag = 0;
            if ((mask & (1u << wheel)) && (!get(vehicle_ + 0x18b40 + wheel, flag) || flag != 1))
                return false;
        }
        mask_ = mask;
        for (unsigned wheel = 0; wheel < 4; ++wheel)
            if ((mask & (1u << wheel)) && !component(wheel))
                return false;
        // Drop no-op patches produced by removing the last registry element.
        patches_.erase(std::remove_if(patches_.begin(), patches_.end(),
                                      [](const RegistryPatch &p) { return p.before == p.after; }),
                       patches_.end());
        out = std::move(patches_);
        return true;
    }

  private:
    RegistryReader reader_;
    uintptr_t base_ = 0, vehicle_ = 0, table_ = 0;
    unsigned visited_ = 0, mask_ = 0;
    size_t budget_ = 0;
    std::vector<RegistryPatch> patches_;

    static bool range(uintptr_t p, size_t size) {
        return p >= 0x10000 && size && p < UINT64_C(0x800000000000) &&
               size <= UINT64_C(0x800000000000) - p;
    }
    bool read(uintptr_t address, void *out, size_t size) {
        if (!range(address, size) || size > 32768 || budget_ + size > 4 * 1024 * 1024)
            return false;
        budget_ += size;
        if (!reader_.read(reader_.user, address, out, size))
            return false;
        // Later removals see the already planned swaps, without writing them.
        for (const auto &p : patches_) {
            const auto begin = std::max(address, p.address);
            const auto end = std::min(address + size, p.address + p.size);
            if (begin < end)
                std::memcpy(static_cast<unsigned char *>(out) + begin - address,
                            p.after.data() + begin - p.address, end - begin);
        }
        return true;
    }
    template <typename T> bool get(uintptr_t address, T &value) {
        return read(address, &value, sizeof(value));
    }
    template <typename T> bool put(uintptr_t address, const T &value) {
        static_assert(sizeof(T) <= 8);
        for (auto &p : patches_) {
            if (p.address == address && p.size == sizeof(T)) {
                std::memcpy(p.after.data(), &value, sizeof(value));
                return true;
            }
            if (address < p.address + p.size && p.address < address + sizeof(T))
                return false;
        }
        if (patches_.size() >= 1024 || !range(address, sizeof(T)))
            return false;
        RegistryPatch p;
        p.address = address;
        p.size = sizeof(T);
        if (!reader_.read(reader_.user, address, p.before.data(), sizeof(T)))
            return false;
        std::memcpy(p.after.data(), &value, sizeof(T));
        patches_.push_back(p);
        return true;
    }
    bool remove_list(uintptr_t count_address, uintptr_t pointer_address, uintptr_t node) {
        int32_t count = 0;
        uintptr_t entries = 0;
        if (!get(count_address, count) || count < 0 || count > 4096 ||
            !get(pointer_address, entries))
            return false;
        if (!count)
            return true;
        std::vector<uintptr_t> values(static_cast<size_t>(count));
        if (!read(entries, values.data(), values.size() * sizeof(uintptr_t)))
            return false;
        const auto found = std::find(values.begin(), values.end(), node);
        if (found == values.end())
            return true;
        // Native registries contain a component at most once.
        if (std::find(found + 1, values.end(), node) != values.end())
            return false;
        return put(count_address, count - 1) &&
               put(entries + size_t(found - values.begin()) * 8, values.back());
    }
    bool remove_node(uintptr_t node) {
        int32_t index = -1;
        if (!get(node, index) || index < -1)
            return false;
        const bool active = index != -1;
        if (active) {
            int32_t count = 0;
            uintptr_t entries = 0, current = 0, last = 0;
            if (!get(base_ + 0x3b8aa10, count) || count <= index || count > 4096 ||
                !get(base_ + 0x3b8aa18, entries) || !get(entries + unsigned(index) * 8, current) ||
                current != node || !get(entries + unsigned(count - 1) * 8, last) ||
                !range(last, 40))
                return false;
            int32_t last_index = -1;
            if (!get(last, last_index) || last_index != count - 1 ||
                !put(base_ + 0x3b8aa10, count - 1) || !put(entries + unsigned(index) * 8, last) ||
                !put(last, index) || !put(node, int32_t(-1)))
                return false;
        }
        const unsigned side = active ? 0 : 0x10;
        // FF3B40 removes active entries; FF3680 removes inactive entries.
        for (unsigned bucket = 0; bucket < 64; ++bucket) {
            const auto row = base_ + 0x3b8ace0 + bucket * 0x20 + side;
            if (!remove_list(row + 4, row + 8, node))
                return false;
        }
        return remove_list(base_ + 0x3b8b4e4 + side, base_ + 0x3b8b4e8 + side, node);
    }
    bool component(unsigned index) {
        unsigned char detached = 0;
        if (index >= 18 || !get(vehicle_ + 0x18b40 + index, detached) || detached > 2)
            return false;
        if (detached != 1)
            return true;
        // Non-wheel components need their own verified table and lifetime rules.
        if (index >= 4 || !(mask_ & (1u << index)) || (visited_ & (1u << index)))
            return false;
        visited_ |= 1u << index;
        if (!remove_node(table_ + index * 40) ||
            !put(vehicle_ + 0x18b40 + index, static_cast<unsigned char>(0)))
            return false;
        std::array<unsigned char, 4> children{};
        if (!get(vehicle_ + 0x186e0 + index * 4, children))
            return false;
        for (auto child : children)
            if (child < 18 && !component(child))
                return false;
        return true;
    }
};
} // namespace sector_attachment
