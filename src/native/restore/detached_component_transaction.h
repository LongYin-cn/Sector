#pragma once
#include "detached_component_plan.h"

namespace sector_attachment {

struct RegistryBackend {
    void *user = nullptr;
    bool (*pinned)(void *) = nullptr;
    bool (*read)(void *, uintptr_t, void *, size_t) = nullptr;
    bool (*write)(void *, uintptr_t, const void *, size_t) = nullptr;
};

// Owns compensation for the collision registry separately from the typed
// physics plan. The caller keeps the same native locks and lifetime pins held
// until finish succeeds. Failed compensation must quarantine the reset host.
class RegistryTransaction {
  public:
    explicit RegistryTransaction(RegistryBackend backend) : backend_(backend) {}

    bool begin(uintptr_t module, uintptr_t vehicle, unsigned mask) {
        if (active_ || !valid())
            return false;
        patches_.clear();
        attempted_ = 0;
        applied_ = false;
        try {
            RegistryPlanner planner({backend_.user, backend_.read});
            if (!planner.wheels(module, vehicle, mask, patches_) || !matches(false))
                return false;
        } catch (...) {
            patches_.clear();
            return false;
        }
        active_ = true;
        return true;
    }

    bool apply() {
        if (!active_ || applied_ || attempted_ || !matches(false))
            return false;
        for (const auto &p : patches_) {
            if (!valid())
                return false;
            // Include failed writes: a backend may have written a prefix.
            ++attempted_;
            if (!backend_.write(backend_.user, p.address, p.after.data(), p.size) ||
                !equal(p, true))
                return false;
        }
        applied_ = true;
        return valid();
    }

    bool rollback() {
        if (!active_ || !valid())
            return false;
        // A failed recovery retains the journal and attempted count so that
        // callers cannot accidentally discard an incompletely restored list.
        bool recovered = true;
        for (size_t i = attempted_; i; --i) {
            const auto &p = patches_[i - 1];
            if (!valid())
                return false;
            const bool written = backend_.write(backend_.user, p.address, p.before.data(), p.size);
            if (!written || !equal(p, false))
                recovered = false;
        }
        if (!recovered || !matches(false))
            return false;
        attempted_ = 0;
        applied_ = false;
        return true;
    }

    bool finish(bool commit) {
        if (!active_ || !valid())
            return false;
        if (commit ? (!applied_ || !matches(true)) : !rollback())
            return false;
        patches_.clear();
        attempted_ = 0;
        active_ = applied_ = false;
        return true;
    }

    bool active() const {
        return active_;
    }
    size_t field_count() const {
        return patches_.size();
    }

  private:
    RegistryBackend backend_;
    std::vector<RegistryPatch> patches_;
    size_t attempted_ = 0;
    bool active_ = false, applied_ = false;

    bool valid() const {
        return backend_.pinned && backend_.read && backend_.write && backend_.pinned(backend_.user);
    }
    bool equal(const RegistryPatch &p, bool after) const {
        std::array<unsigned char, 8> bytes{};
        return valid() && backend_.read(backend_.user, p.address, bytes.data(), p.size) &&
               !std::memcmp(bytes.data(), (after ? p.after : p.before).data(), p.size) && valid();
    }
    bool matches(bool after) const {
        if (!valid())
            return false;
        for (const auto &p : patches_)
            if (!equal(p, after))
                return false;
        return valid();
    }
};
} // namespace sector_attachment
