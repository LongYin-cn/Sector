"""Resolve resident DLLs against their own verified build, including app upgrades.

Every runtime module imports this one, so the message type the desktop renders
lives here: failures keep their canonical English sentence for logs and carry a
stable translation key for the interface.
"""

import hashlib
import json
import os
from pathlib import Path
import re

HOST_REVISION = 28


class ResetMessageError(ValueError):
    """A failure that carries a translation key next to its English sentence."""

    def __init__(self, message, key=None, params=None, blocked_reason=None):
        super().__init__(message)
        self.key = key
        self.params = dict(params or {})
        self.blocked_reason = blocked_reason


def user_message(key, text, **params):
    """Status fields: canonical English text plus the key the desktop translates."""
    return {"message": text, "message_key": key, "message_params": params}


def physical_host_identity(name):
    match = re.fullmatch(r"lmu-physical-reset-v(\d+)-25661166(?:-([0-9a-f]{32}))?\.dll", name)
    if not match or not 1 <= int(match[1]) <= HOST_REVISION:
        return None
    revision = int(match[1])
    if match[2] and revision < 9:
        return None
    prefix = f"LMU_PhysicalReset_{name}_" if match[2] else f"LMU_PhysicalReset25661166_v{revision}_"
    return (
        "sector.runtime.reset_host_runner",
        f"steam-25661166-physical-reset-v{revision}.json",
        prefix,
        0x4C4D555253543030 + revision,
    )


def resident_profile(entry, manifest, project, runtime_store=None):
    """Never confuse a stopped older release with the current release's DLL path."""
    name = entry["name"].lower()
    resident = Path(entry["path"]).resolve()
    project = Path(project).resolve()
    root = resident.parent.parent
    if runtime_store is None:
        runtime_store = Path(os.environ.get("APPDATA", "")) / "Sector" / "runtime"
    runtime_store = Path(runtime_store).resolve()
    if resident.parent != project / "bin":
        # Only a content-addressed Sector installation may supply an older profile.
        release = re.fullmatch(r"\d+\.\d+\.\d+-([0-9a-f]{16})", root.name)
        if resident.parent.name != "bin" or root.parent != runtime_store or not release:
            raise ResetMessageError(
                f"Unrecognized resident location: {resident}. Restart LMU.",
                key="python.error.residentLocation",
                params={"path": str(resident)},
            )
        inventory_bytes = (root / "release-manifest.json").read_bytes()
        if hashlib.sha256(inventory_bytes).hexdigest()[:16] != release[1]:
            raise ResetMessageError(
                f"Resident release manifest changed: {root.name}. Restart LMU.",
                key="python.error.residentManifest",
                params={"release": root.name},
            )
        inventory = json.loads(inventory_bytes)
        profile_bytes = (root / "compatibility" / manifest).read_bytes()
        if hashlib.sha256(profile_bytes).hexdigest() != inventory.get(f"compatibility/{manifest}"):
            raise ResetMessageError(
                f"Resident profile changed: {name}. Restart LMU.",
                key="python.error.residentProfile",
                params={"name": name},
            )
        profile = json.loads(profile_bytes)
        canonical = re.sub(r"-[0-9a-f]{32}(?=\.dll$)", "", name)
        if inventory.get(f"bin/{canonical}") != profile["dll_sha256"]:
            raise ResetMessageError(
                f"Resident binary/profile mismatch: {name}. Restart LMU.",
                key="python.error.residentMismatch",
                params={"name": name},
            )
    else:
        profile = json.loads((project / "compatibility" / manifest).read_text())
    if (
        resident.name.lower() != name
        or hashlib.sha256(resident.read_bytes()).hexdigest() != profile["dll_sha256"]
    ):
        raise ResetMessageError(
            f"Resident DLL hash mismatch: {name}. Restart LMU.",
            key="python.error.residentHash",
            params={"name": name},
        )
    return profile


def verify_stopped_resident(state, magic, pid):
    if (
        state.magic != magic
        or state.pid != pid
        or state.version != 1
        or state.status != 3
        or state.error
        or state.stop != 1
        or state.allow_observation
    ):
        raise ResetMessageError(
            "Snapshot module not cleanly stopped",
            key="python.error.snapshotNotStopped",
        )
