// Desktop admission only. The native runner repeats compatibility, offline and EAC checks.
const EAC_MESSAGE =
  "Easy Anti-Cheat detected. Save/Restore and their shortcuts are disabled. Close LMU, then use Open LMU without EAC for Offline Practice. Overlays remain available.";
async function resetAccess(game, request = fetch) {
  if (game.eac === true)
    return {
      allowed: false,
      code: "eac",
      reason: EAC_MESSAGE,
    };
  try {
    const response = await request("http://127.0.0.1:6397/navigation/state", {
      signal: AbortSignal.timeout(500),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Session unavailable");
    const { state } = await response.json();
    if (
      state?.settingMode === "SETTING_GRANDPRIX" &&
      /^PRACTICE[1-4]$/.test(state.gameSession)
    )
      return { allowed: true };
  } catch {
    // Missing or unknown context never starts a process-writing listener.
  }
  return {
    allowed: false,
    reason:
      "Active Reset requires Offline Practice. Overlays remain available.",
  };
}
module.exports = { resetAccess, EAC_MESSAGE };
