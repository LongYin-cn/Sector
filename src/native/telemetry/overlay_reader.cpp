// Read-only LMU SDK consumer. The only writable mapping is the SDK lock protocol.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <cstdint>
#include <cstdio>
#include <cmath>
#include <cstring>
#include <cstdlib>
#include <optional>
#include <utility>
#include <sstream>
#include <string>
#include <algorithm>
#include "SharedMemoryInterface.hpp"

static_assert(sizeof(SharedMemoryLayout) == 324824 && sizeof(TelemInfoV01) == 1888 &&
                  sizeof(VehicleScoringInfoV01) == 584,
              "Unsupported LMU SDK layout");
struct Handle {
    HANDLE h = nullptr;
    ~Handle() {
        if (h)
            CloseHandle(h);
    }
};
struct View {
    void *p = nullptr;
    ~View() {
        if (p)
            UnmapViewOfFile(p);
    }
};

static bool lmuRunning(DWORD pid) {
    // Enumerate process names without opening the protected game. Telemetry comes
    // exclusively from LMU's public SDK mapping, including in online sessions.
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE)
        return false;
    Handle processes{snapshot};
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof entry;
    for (BOOL found = Process32FirstW(snapshot, &entry); found;
         found = Process32NextW(snapshot, &entry))
        if (entry.th32ProcessID == pid)
            return _wcsicmp(entry.szExeFile, L"Le Mans Ultimate.exe") == 0;
    return false;
}

struct RefreshClock {
    Handle timer{CreateWaitableTimerExW(nullptr, nullptr, 0x2, TIMER_ALL_ACCESS)};
    LONGLONG frequency = 0, start = 0, frame = 0;
    double rate = 60;
    RefreshClock() {
        // Older Windows versions may not support a high-resolution waitable timer.
        if (!timer.h)
            timer.h = CreateWaitableTimerW(nullptr, FALSE, nullptr);
        LARGE_INTEGER value;
        QueryPerformanceFrequency(&value);
        frequency = value.QuadPart;
        QueryPerformanceCounter(&value);
        start = value.QuadPart;
    }
    bool setRate(double value) {
        if (!std::isfinite(value) || value < 1 || value > 1000)
            return false;
        if (value != rate) {
            rate = value;
            LARGE_INTEGER now;
            QueryPerformanceCounter(&now);
            start = now.QuadPart;
            frame = 0;
        }
        return true;
    }
    bool wait() {
        if (!timer.h || frequency <= 0)
            return false;
        LARGE_INTEGER now;
        QueryPerformanceCounter(&now);
        // Absolute display-rate deadlines include serialization time in the budget.
        // Skip missed slots after a stall instead of queuing a burst of old frames.
        frame = std::max(frame + 1, LONGLONG((now.QuadPart - start) * rate / frequency) + 1);
        const LONGLONG deadline = start + LONGLONG(frame * double(frequency) / rate);
        LARGE_INTEGER due;
        due.QuadPart = -std::max<LONGLONG>(1, (deadline - now.QuadPart) * 10000000 / frequency);
        return SetWaitableTimer(timer.h, &due, 0, nullptr, nullptr, FALSE) &&
               WaitForSingleObject(timer.h, 1000) == WAIT_OBJECT_0;
    }
};

static bool parseRate(const char *text, double &rate) {
    char *end = nullptr;
    const double value = strtod(text, &end);
    if (end == text || *end || !std::isfinite(value) || value < 1 || value > 1000)
        return false;
    rate = value;
    return true;
}

struct ReaderControl {
    std::string pending;
    bool consume(const char *bytes, size_t count, RefreshClock &clock) {
        for (size_t i = 0; i < count; ++i) {
            if (bytes[i] == '\n') {
                if (!pending.empty() && pending.back() == '\r')
                    pending.pop_back();
                double rate = 0;
                if (pending.compare(0, 5, "rate ") != 0 || !parseRate(pending.c_str() + 5, rate) ||
                    !clock.setRate(rate))
                    return false;
                pending.clear();
            } else {
                if (pending.size() >= 64 || bytes[i] == '\0')
                    return false;
                pending += bytes[i];
            }
        }
        return true;
    }
    bool poll(RefreshClock &clock) {
        DWORD available = 0, read = 0;
        const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
        if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr))
            return false;
        if (!available)
            return true;
        char bytes[128];
        return ReadFile(input, bytes, std::min<DWORD>(available, sizeof bytes), &read, nullptr) &&
               read && consume(bytes, read, clock);
    }
};
struct LockWords {
    volatile LONG waiters;
    volatile LONG busy;
};
struct Lease {
    LockWords *words;
    HANDLE event;
    bool held;
    Lease(LockWords *w, HANDLE e)
        : words(w), event(e), held(InterlockedCompareExchange(&w->busy, 1, 0) == 0) {}
    ~Lease() {
        if (held) {
            InterlockedExchange(&words->busy, 0);
            if (InterlockedCompareExchange(&words->waiters, 0, 0) > 0)
                SetEvent(event);
        }
    }
};
static void number(std::ostream &out, double value) {
    if (std::isfinite(value))
        out << value;
    else
        out << "null";
}
template <size_t N> static void text(std::ostream &out, const char (&value)[N]) {
    size_t length = 0;
    while (length < N && value[length])
        ++length;
    // Prefer UTF-8 names; legacy local encodings are normalized before JSON output.
    UINT encoding = CP_UTF8;
    DWORD flags = MB_ERR_INVALID_CHARS;
    int count = MultiByteToWideChar(encoding, flags, value, int(length), nullptr, 0);
    if (!count && length) {
        encoding = CP_ACP;
        flags = 0;
        count = MultiByteToWideChar(encoding, flags, value, int(length), nullptr, 0);
    }
    std::wstring wide(size_t(count), L'\0');
    if (count)
        MultiByteToWideChar(encoding, flags, value, int(length), wide.data(), count);
    int size =
        count ? WideCharToMultiByte(CP_UTF8, 0, wide.data(), count, nullptr, 0, nullptr, nullptr)
              : 0;
    std::string utf8(size_t(size), '\0');
    if (size)
        WideCharToMultiByte(CP_UTF8, 0, wide.data(), count, utf8.data(), size, nullptr, nullptr);
    out << '"';
    for (unsigned char c : utf8) {
        if (c == '"' || c == '\\')
            out << '\\' << char(c);
        else if (c < 32) {
            char escaped[7];
            snprintf(escaped, sizeof escaped, "\\u%04x", c);
            out << escaped;
        } else
            out << char(c);
    }
    out << '"';
}

struct CarResources {
    bool available = false;
    char model[30]{};
    float energy = 0;
    char compounds[4][18]{};
    bool live = false;
    double elapsed = 0, travel = 0, speed = 0;
};

static void liveProgress(CarResources &out, const VehicleScoringInfoV01 &scored,
                         const TelemInfoV01 &current, double scoringTime) {
    // Project measured movement onto the last scored forward axis. This is a
    // short-lived estimate between scoring frames, never an official lap distance.
    const double age = current.mElapsedTime - scoringTime;
    const double dx = current.mPos.x - scored.mPos.x;
    const double dy = current.mPos.y - scored.mPos.y;
    const double dz = current.mPos.z - scored.mPos.z;
    const double fx = -scored.mOri[0].z, fy = -scored.mOri[1].z, fz = -scored.mOri[2].z;
    const double axisLength = fx * fx + fy * fy + fz * fz;
    const double heading =
        -(fx * current.mOri[0].z + fy * current.mOri[1].z + fz * current.mOri[2].z);
    const double speed = -current.mLocalVel.z;
    const double bound = 3 + 2 * std::max(std::abs(speed), std::abs(scored.mLocalVel.z)) * age;
    const double displacement = std::sqrt(dx * dx + dy * dy + dz * dz);
    if (!std::isfinite(age) || age < 0 || age > .5 || !std::isfinite(axisLength) ||
        std::abs(axisLength - 1) > .01 || !std::isfinite(heading) || heading < .8 ||
        !std::isfinite(speed) || !std::isfinite(bound) || !std::isfinite(displacement) ||
        displacement > 100 || displacement > bound)
        return;
    out.live = true;
    out.elapsed = current.mElapsedTime;
    out.travel = dx * fx + dy * fy + dz * fz;
    out.speed = speed;
}
struct Frame {
    long version;
    ScoringInfoV01 scoring;
    VehicleScoringInfoV01 cars[104];
    CarResources resources[104];
    TelemInfoV01 telemetry;
    bool player = false;
};
static bool copyFrame(Frame &f, const SharedMemoryObjectOut &data) {
    f.version = data.generic.gameVersion;
    if (f.version != 14200)
        return false;
    f.scoring = data.scoring.scoringInfo;
    auto count = f.scoring.mNumVehicles;
    if (count < 0 || count > 104 || data.telemetry.activeVehicles > 104)
        return false;
    memcpy(f.cars, data.scoring.vehScoringInfo, size_t(count) * sizeof f.cars[0]);
    const auto &t = data.telemetry;
    for (long i = 0; i < count; ++i) {
        const TelemInfoV01 *match = nullptr;
        int matches = 0;
        for (unsigned j = 0; j < t.activeVehicles; ++j) {
            if (t.telemInfo[j].mID == f.cars[i].mID) {
                match = &t.telemInfo[j];
                ++matches;
            }
        }
        auto &r = f.resources[i];
        r = {};
        // Never attach another car's resources or retain stale remote telemetry.
        if (matches != 1 || !std::isfinite(match->mElapsedTime) ||
            std::abs(match->mElapsedTime - f.scoring.mCurrentET) > 1.5)
            continue;
        r.available = true;
        liveProgress(r, f.cars[i], *match, f.scoring.mCurrentET);
        memcpy(r.model, match->mVehicleModel, sizeof r.model);
        r.energy = match->mVirtualEnergy;
        for (int wheel = 0; wheel < 4; ++wheel) {
            const auto index = match->mWheel[wheel].mCompoundIndex;
            const char *name = nullptr;
            if (wheel >= 2 && index == match->mRearTireCompoundIndex)
                name = match->mRearTireCompoundName;
            else if (index == match->mFrontTireCompoundIndex)
                name = match->mFrontTireCompoundName;
            else if (index == match->mRearTireCompoundIndex)
                name = match->mRearTireCompoundName;
            if (name)
                memcpy(r.compounds[wheel], name, sizeof r.compounds[wheel]);
        }
    }
    if (t.playerHasVehicle && t.playerVehicleIdx < t.activeVehicles) {
        const auto &candidate = t.telemInfo[t.playerVehicleIdx];
        int matches = 0;
        for (long i = 0; i < count; ++i)
            if (f.cars[i].mIsPlayer && f.cars[i].mID == candidate.mID)
                ++matches;
        if (matches == 1) {
            f.telemetry = candidate;
            f.player = true;
        }
    }
    return true;
}
static std::string serialize(const Frame &f, bool foreground) {
    const auto &s = f.scoring;
    const auto &t = f.telemetry;
    std::ostringstream o;
    o.precision(10);
    o << "{\"schema\":1,\"connected\":true,\"foreground\":" << (foreground ? "true" : "false")
      << ",\"driving\":" << (s.mInRealtime && f.player ? "true" : "false")
      << ",\"paused\":" << (s.mGamePhase == 9 ? "true" : "false") << ",\"session\":" << s.mSession
      << ",\"track\":";
    text(o, s.mTrackName);
    auto n = [&](const char *key, double value) {
        o << ",\"" << key << "\":";
        number(o, value);
    };
    n("et", s.mCurrentET);
    n("gamePhase", s.mGamePhase);
    n("yellowFlagState", s.mYellowFlagState);
    n("end", s.mEndET);
    n("remaining", s.mSessionTimeRemaining);
    n("length", s.mLapDist);
    n("air", s.mAmbientTemp);
    n("trackTemp", s.mTrackTemp);
    n("rain", s.mRaining);
    n("wetness", s.mAvgPathWetness);
    n("cloud", s.mDarkCloud);
    n("limitMax", s.mTrackLimitsStepsPerPenalty);
    n("limitStep", s.mTrackLimitsStepsPerPoint);
    o << ",\"player\":";
    if (!f.player)
        o << "null";
    else {
        o << "{\"id\":" << t.mID;
        n("et", t.mElapsedTime);
        n("lap", t.mLapNumber);
        n("lapStart", t.mLapStartET);
        n("throttle", t.mUnfilteredThrottle);
        n("brake", t.mUnfilteredBrake);
        n("clutch", t.mUnfilteredClutch);
        n("steering", t.mUnfilteredSteering);
        n("steeringRange", t.mVisualSteeringWheelRange);
        n("speed", sqrt(t.mLocalVel.x * t.mLocalVel.x + t.mLocalVel.y * t.mLocalVel.y +
                        t.mLocalVel.z * t.mLocalVel.z) *
                       3.6);
        n("gear", t.mGear);
        n("fuel", t.mFuel);
        n("energy", t.mVirtualEnergy);
        n("fuelCapacity", t.mFuelCapacity);
        o << ",\"model\":";
        text(o, t.mVehicleModel);
        o << ",\"hybrid\":{\"state\":" << unsigned(t.mElectricBoostMotorState);
        n("battery", t.mBatteryChargeFraction);
        n("torque", t.mElectricBoostMotorTorque);
        n("rpm", t.mElectricBoostMotorRPM);
        n("regenKW", t.mRegen);
        n("map", t.mMotorMap);
        n("mapMax", t.mMotorMapMax);
        o << '}';
        n("delta", t.mDeltaBest);
        n("limits", t.mTrackLimitsSteps);
        o << ",\"invalid\":" << (t.mLapInvalidated ? "true" : "false");
        o << ",\"frontCompound\":";
        text(o, t.mFrontTireCompoundName);
        o << ",\"rearCompound\":";
        text(o, t.mRearTireCompoundName);
        o << ",\"wheels\":[";
        for (int i = 0; i < 4; ++i) {
            if (i)
                o << ',';
            const auto &w = t.mWheel[i];
            o << "{\"attached\":" << (w.mDetached ? "false" : "true")
              << ",\"flat\":" << (w.mFlat ? "true" : "false");
            n("rotation", w.mRotation);
            n("groundSpeed", w.mLongitudinalGroundVel);
            n("lateralSpeed", w.mLateralGroundVel);
            n("radius", double(w.mStaticUndeflectedRadius) / 100.0);
            n("deflection", w.mVerticalTireDeflection);
            n("load", w.mTireLoad);
            n("surface", w.mSurfaceType);
            n("wear", w.mWear);
            n("pressure", w.mPressure);
            n("compoundIndex", w.mCompoundIndex);
            o << ",\"temperatures\":[";
            for (int j = 0; j < 3; ++j) {
                if (j)
                    o << ',';
                // The SDK reports left/centre/right tread samples in Kelvin.
                number(o, w.mTemperature[j] > 0 ? w.mTemperature[j] - 273.15 : NAN);
            }
            o << "]}";
        }
        o << "]}";
    }
    o << ",\"cars\":[";
    for (long i = 0; i < s.mNumVehicles; ++i) {
        if (i)
            o << ',';
        const auto &v = f.cars[i];
        o << "{\"id\":" << v.mID << ",\"name\":";
        text(o, v.mDriverName);
        o << ",\"vehicle\":";
        text(o, v.mVehicleName);
        o << ",\"vehicleFile\":";
        text(o, v.mVehFilename);
        o << ",\"model\":";
        text(o, f.resources[i].model);
        o << ",\"class\":";
        text(o, v.mVehicleClass);
        o << ",\"player\":" << (v.mIsPlayer ? "true" : "false")
          << ",\"pit\":" << (v.mInPits ? "true" : "false");
        n("place", v.mPlace);
        n("laps", v.mTotalLaps);
        n("distance", v.mLapDist);
        n("last", v.mLastLapTime);
        n("best", v.mBestLapTime);
        n("behind", v.mTimeBehindLeader);
        n("lapsBehind", v.mLapsBehindLeader);
        n("lapStart", v.mLapStartET);
        n("estimated", v.mEstimatedLapTime);
        n("pitStops", v.mNumPitstops);
        n("qualification", v.mQualification);
        n("countLap", v.mCountLapFlag);
        // Keep native codes intact: an invalid lap, disqualification and
        // session flag are different incidents, even if the UI uses red.
        n("penalties", v.mNumPenalties);
        n("finishStatus", v.mFinishStatus);
        n("flag", v.mFlag);
        const auto &r = f.resources[i];
        o << ",\"liveProgress\":";
        if (!r.live)
            o << "null";
        else {
            o << "{";
            o << "\"et\":";
            number(o, r.elapsed);
            n("travel", r.travel);
            n("speed", r.speed);
            o << '}';
        }
        o << ",\"resources\":";
        if (!r.available)
            o << "null";
        else {
            o << "{\"energy\":";
            number(o, r.energy);
            o << ",\"compounds\":[";
            for (int j = 0; j < 4; ++j) {
                if (j)
                    o << ',';
                text(o, r.compounds[j]);
            }
            o << "]}";
        }
        o << '}';
    }
    o << "]}";
    return o.str();
}
int main(int argc, char **argv) {
    if ((argc == 2 || argc == 3) && !strcmp(argv[1], "--test-cadence")) {
        RefreshClock clock;
        double rate = 60;
        if ((argc == 3 && !parseRate(argv[2], rate)) || !clock.setRate(rate))
            return 2;
        const unsigned samples = unsigned(std::ceil(rate * 2));
        for (unsigned i = 0; i < samples; ++i)
            if (!clock.wait())
                return 1;
        LARGE_INTEGER now;
        QueryPerformanceCounter(&now);
        const double elapsed = double(now.QuadPart - clock.start) / clock.frequency;
        std::printf("Overlay cadence: %.2f Hz, target %.3f Hz (%u deadlines, %.3f s).\n",
                    samples / elapsed, rate, samples, elapsed);
        const double expected = samples / rate;
        return elapsed >= expected - .02 && elapsed <= expected * 1.1 ? 0 : 1;
    }
    if (argc == 2 && (!strcmp(argv[1], "--self-test") || !strcmp(argv[1], "--test-frame"))) {
        auto *data = new SharedMemoryObjectOut{};
        Frame f{};
        data->generic.gameVersion = 14200;
        bool ok = copyFrame(f, *data) && !f.player;
        RefreshClock testClock;
        ReaderControl control;
        ok = ok && control.consume("rate 14", 7, testClock) && testClock.rate == 60 &&
             control.consume("4\nrate 59.94\n", 13, testClock) && testClock.rate == 59.94;
        for (const char *invalid :
             {"rate 0\n", "rate nan\n", "rate 1001\n", "rate 60junk\n", "stop\n"}) {
            ReaderControl rejected;
            ok = ok && !rejected.consume(invalid, strlen(invalid), testClock);
        }
        data->scoring.scoringInfo.mNumVehicles = 105;
        ok = ok && !copyFrame(f, *data);
        data->scoring.scoringInfo.mNumVehicles = 1;
        data->scoring.vehScoringInfo[0].mIsPlayer = true;
        data->scoring.vehScoringInfo[0].mID = 7;
        data->telemetry.activeVehicles = 1;
        data->telemetry.playerHasVehicle = true;
        data->telemetry.telemInfo[0].mID = 8;
        Frame mismatch{};
        ok = ok && copyFrame(mismatch, *data) && !mismatch.player;
        data->telemetry.telemInfo[0].mID = 7;
        Frame match{};
        ok = ok && copyFrame(match, *data) && match.player;
        match.telemetry.mWheel[0].mTemperature[0] = 371.15;
        match.telemetry.mWheel[0].mTemperature[1] = 366.15;
        match.telemetry.mWheel[0].mTemperature[2] = 361.15;
        match.telemetry.mWheel[0].mWear = 0.71;
        match.telemetry.mWheel[0].mStaticUndeflectedRadius = 31;
        match.telemetry.mWheel[0].mVerticalTireDeflection = 0.01;
        match.telemetry.mWheel[0].mLongitudinalGroundVel = 30;
        match.telemetry.mWheel[0].mLateralGroundVel = 2;
        match.telemetry.mWheel[0].mRotation = 45;
        match.telemetry.mWheel[0].mTireLoad = 3000;
        match.telemetry.mUnfilteredBrake = 0.84;
        match.telemetry.mElectricBoostMotorState = 2;
        match.telemetry.mBatteryChargeFraction = 0.45;
        match.telemetry.mElectricBoostMotorTorque = 120;
        match.telemetry.mElectricBoostMotorRPM = 10000;
        match.telemetry.mMotorMap = 3;
        match.telemetry.mMotorMapMax = 5;
        strcpy(match.telemetry.mVehicleModel, "Porsche 963");
        strcpy(match.cars[0].mVehicleName, "Team #6");
        strcpy(match.cars[0].mVehFilename, "Porsche_963_6.veh");
        match.scoring.mInRealtime = true;
        match.scoring.mGamePhase = 5;
        match.scoring.mYellowFlagState = -1;
        match.cars[0].mNumPenalties = 2;
        match.cars[0].mFinishStatus = 3;
        match.cars[0].mFlag = 6;
        strcpy(match.telemetry.mFrontTireCompoundName, "Soft");
        data->telemetry.telemInfo[0] = match.telemetry;
        data->telemetry.telemInfo[0].mVirtualEnergy = 0.42f;
        Frame resources{};
        ok = ok && copyFrame(resources, *data) && resources.resources[0].available &&
             !strcmp(resources.resources[0].model, "Porsche 963") &&
             !strcmp(resources.resources[0].compounds[0], "Soft");
        match.resources[0] = resources.resources[0];
        data->telemetry.telemInfo[0].mElapsedTime = -5;
        ok = ok && copyFrame(resources, *data) && !resources.resources[0].available &&
             !resources.resources[0].model[0];
        data->telemetry.telemInfo[0].mElapsedTime = 0;
        data->telemetry.activeVehicles = 2;
        data->scoring.scoringInfo.mNumVehicles = 2;
        data->scoring.vehScoringInfo[1].mID = 9;
        data->telemetry.telemInfo[1].mID = 9;
        data->telemetry.telemInfo[1].mVirtualEnergy = 0.66f;
        strcpy(data->telemetry.telemInfo[1].mFrontTireCompoundName, "Medium");
        strcpy(data->telemetry.telemInfo[1].mVehicleModel, "Oreca 07");
        ok = ok && copyFrame(resources, *data) && resources.resources[1].available &&
             std::abs(resources.resources[1].energy - 0.66f) < 0.0001 &&
             !strcmp(resources.resources[1].compounds[0], "Medium") &&
             !strcmp(resources.resources[1].model, "Oreca 07") &&
             !strcmp(resources.resources[0].model, "Porsche 963") &&
             !strcmp(resources.resources[0].compounds[0], "Soft");
        data->telemetry.telemInfo[1].mID = 7;
        ok = ok && copyFrame(resources, *data) && !resources.resources[0].available &&
             !resources.resources[1].available && !resources.resources[0].model[0] &&
             !resources.resources[1].model[0];
        VehicleScoringInfoV01 scored{};
        TelemInfoV01 current{};
        scored.mOri[2].z = current.mOri[2].z = 1;
        scored.mLocalVel.z = current.mLocalVel.z = -40;
        current.mElapsedTime = 2.25;
        current.mPos.z = -10;
        CarResources live{};
        liveProgress(live, scored, current, 2);
        ok = ok && live.live && live.travel == 10 && live.speed == 40;
        match.resources[0].live = live.live;
        match.resources[0].travel = live.travel;
        match.resources[0].elapsed = live.elapsed;
        match.resources[0].speed = live.speed;
        for (unsigned invalid = 0; invalid < 5; ++invalid) {
            auto changed = current;
            if (invalid == 0)
                changed.mElapsedTime = 1.9;
            if (invalid == 1)
                changed.mElapsedTime = 2.6;
            if (invalid == 2)
                changed.mPos.z = -200;
            if (invalid == 3)
                changed.mOri[2].z = -1;
            if (invalid == 4)
                changed.mPos.x = NAN;
            CarResources rejected{};
            liveProgress(rejected, scored, changed, 2);
            ok = ok && !rejected.live;
        }
        const auto json = serialize(match, false);
        match.scoring.mGamePhase = 9;
        ok = ok && serialize(match, false).find("\"paused\":true") != std::string::npos &&
             json.find("\"paused\":false") != std::string::npos;
        ok = ok && json.find("\"temperatures\":[98,93,88]") != std::string::npos &&
             json.find("\"radius\":0.31") != std::string::npos;
        std::ostringstream encoded;
        text(encoded, "Ren\xc3\xa9\n");
        ok = ok && encoded.str() == "\"Ren\xc3\xa9\\u000a\"";
        delete data;
        if (!strcmp(argv[1], "--test-frame")) {
            puts(json.c_str());
            return ok ? 0 : 1;
        }
        puts(ok ? "PASS overlay SDK bounds and player identity" : "FAIL");
        return ok ? 0 : 1;
    }
    if (argc != 3 && argc != 4)
        return 2;
    double rate = 60;
    if (argc == 4 && !parseRate(argv[3], rate))
        return 2;
    DWORD pid = strtoul(argv[1], nullptr, 10), owner = strtoul(argv[2], nullptr, 10);
    if (!pid || !owner)
        return 2;
    Handle parent{OpenProcess(SYNCHRONIZE, FALSE, owner)};
    if (!parent.h || !lmuRunning(pid))
        return 3;
    Handle mapping{OpenFileMappingA(FILE_MAP_READ, FALSE, "LMU_Data")};
    View data{mapping.h ? MapViewOfFile(mapping.h, FILE_MAP_READ, 0, 0, sizeof(SharedMemoryLayout))
                        : nullptr};
    Handle lock{
        OpenFileMappingA(FILE_MAP_READ | FILE_MAP_WRITE, FALSE, "LMU_SharedMemoryLockData")};
    View words{lock.h
                   ? MapViewOfFile(lock.h, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(LockWords))
                   : nullptr};
    Handle event{OpenEventA(EVENT_MODIFY_STATE, FALSE, "LMU_SharedMemoryLockEvent")};
    if (!data.p || !words.p || !event.h)
        return 4;
    RefreshClock refresh;
    refresh.setRate(rate);
    ReaderControl control;
    ULONGLONG nextProcessCheck = GetTickCount64() + 1000;
    while (WaitForSingleObject(parent.h, 0) == WAIT_TIMEOUT) {
        if (GetTickCount64() >= nextProcessCheck) {
            if (!lmuRunning(pid))
                break;
            nextProcessCheck = GetTickCount64() + 1000;
        }
        if (!control.poll(refresh))
            break;
        Frame f{};
        bool copied = false;
        {
            Lease lease(static_cast<LockWords *>(words.p), event.h);
            if (lease.held)
                copied = copyFrame(f, static_cast<const SharedMemoryLayout *>(data.p)->data);
        }
        if (copied) {
            DWORD foreground = 0;
            GetWindowThreadProcessId(GetForegroundWindow(), &foreground);
            auto line = serialize(f, foreground == pid);
            if (puts(line.c_str()) == EOF || fflush(stdout))
                break;
        }
        if (!refresh.wait())
            return 5;
    }
    return 0;
}
