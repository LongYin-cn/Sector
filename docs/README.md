# Sector user guide

Sector helps you practice sections of a track with **Active Reset** and keep
race information visible with **Overlay**. This guide covers everyday use.
For the download and first launch, start with [Install Sector](../README.md#-install-sector).

## Set up LMU

On first launch, confirm the LMU folder Sector finds. If no folder is found,
select the folder containing `Le Mans Ultimate.exe` yourself. You can find it
through Steam: open LMU's **Manage → Browse local files** option in your Library.
Use **Choose folder** to open the Windows folder picker. A valid installation
must be confirmed before continuing; the setup popup cannot be dismissed.

**Active Reset requires LMU's Offline mode.** To prepare the game:

1. Launch LMU **without Easy Anti-Cheat (EAC)**.
2. Select **Offline** mode in LMU.
3. Start a **Practice** session and enter **DRIVE** to drive.

Sector can remain open while you load the session; it connects automatically
when the game is ready.

For overlays, use **windowed or borderless mode** in LMU's display settings.
From 0.2.13, the overlay reader connects to the public SDK independently of
Active Reset. You can launch LMU normally with EAC for online overlays; you do
not need to start an offline Practice. Live online verification of this change
is pending. Active Reset is available only in the offline setup described above.

## Practice a corner or section

1. Drive to the point where you want your practice attempt to begin.
2. Press **F6** and wait for the successful-save confirmation.
3. Drive the section you want to practice.
4. Press **F7** to return to the saved point and try again.

The checkpoint includes the car's direction and saved driving state. A successful
new save replaces the previous checkpoint. If a save is rejected, check the
message in Sector before trying to restore.

Changing sessions or having the game rebuild your car can make a checkpoint
unavailable. Check its status on the **Active Reset** page and save a new one
when needed.

Save with a healthy car and wait for **Checkpoint saved**. After an impact,
wait until the collision ends before restoring. Damage repair is experimental;
front bodywork repair has been verified on the Mercedes-AMG LMGT3, but other
cars and impact types need more testing. Puncture repair is experimental and awaits in-game verification.
Detached parts are not supported. Checkpoints do not persist across game restarts.

### Choose your shortcuts

Click a shortcut on the Active Reset page, then press the key you want to assign.
Press **Escape** to cancel. Use a different key for each action and avoid keys
already used by LMU. Release the keys before returning to the game.

Confirmation sounds can be previewed or muted on the same page.

## Arrange your overlays

1. Open the **Overlay** tab and enable the widgets you want.
2. Turn on **Overlays**, then select **Edit layout**.
3. Move each widget using its blue strip. Drag its lower-right corner to resize it.
4. Select **Lock layout** when you are happy with the arrangement. **Escape** also locks it.

Select a widget in Sector to change its size, transparency and available options.
Column and section switches let you remove information you do not need. For
example, hide the clutch in Inputs or remove manufacturer logos from standings.
The widget adjusts to the remaining content.

For multiple monitors, choose the display in **Edit → Settings → Overlay**.
Your layout and preferences are saved for the next launch.

Widget updates automatically follow that display's refresh rate. Live widgets
hide when you pause or switch away from LMU. During F7, the last frame stays
visible until the new telemetry arrives, while lap and tyre histories reset.

**Tyres** always shows all four tyres. You can hide readings and change the
cold/hot color thresholds. Tyre laps stay
unknown until Sector observes a fresh tyre or replacement. `puncture` comes from
the game; `~flat spot` is Sector's estimate from sustained wheel locks. Increase
**Flat spot sensitivity** for earlier warnings, or hide **Tyre condition** to
remove them. The estimate clears on an observed tyre change, reset or new session.
It cannot detect damage that happened before Sector started observing the tyres.

**Stint planner** estimates remaining laps from fuel and virtual-energy consumption.
Drive complete clean laps to collect the data, then choose how many laps to average
and an optional reserve. Treat these figures as estimates that change with your pace.

**Leaderboard** keeps your position and nearby rivals inside your class section.
Driving a Hypercar puts your group in Hypercar, before the other classes. Its
compound and virtual-energy columns show the available data for each car and
can be hidden independently.

Leaderboard and Relative update gaps between timing samples using measured car
movement. A `~` marks an estimated gap. When fresh telemetry is unavailable,
Sector keeps the latest timing value instead of predicting further ahead.

**Hybrid** shows battery charge, electric power and deploy/regen state. Set the
battery target and the number of laps to reach it. The deployment map automatically
uses your car's range: 0 to 50 in steps of 10 for LMDh, or 0 to 200 in steps of 20
for hybrid LMH. Sector learns battery changes
from clean laps with a constant map; it suggests only maps observed over at least
two laps each at a similar pace. The suggestion stays `-` until enough data exists.
It does not change the map for you. Non-hybrid cars show `N/A`.

### Samples and missing information

You can arrange widgets while LMU is closed using the editor's sample display.
Those samples are for layout editing. During play, widgets use information from
the game; unavailable values show a dash.

Lap history starts when Sector begins observing the session. Relative gaps are
estimates, marked with `~`. Some information, such as future weather forecasts,
is not available from the game reader; you can hide those sections.

## Home

The **Home** tab shows your current session, checkpoint actions and overlay
layout. Session data updates even with overlays off.

In **Active Reset**, **Open LMU without EAC** opens the game from the folder chosen
during setup; keep Steam available. Choose **Offline > Practice** in LMU.
Sector checks for EAC when the game is found and while the reset listener runs.
If detected, a warning appears in Active Reset and Save/Restore, including their
keyboard shortcuts, are blocked. Close LMU and reopen it using this button.
For online racing, launch LMU normally with EAC and use overlays without Active Reset.

- **Save checkpoint** and **Restore checkpoint** perform the action while the game is ready in driving.
- **Open Active Reset** lets you change the assigned keys and confirmation sounds.
- **Edit layout** opens the overlay editor and unlocks the widgets.
- **Overlays on/off** uses the same setting as the Overlay tab.

## Settings, guide and background mode

- Open **Edit → Settings** for app settings and overlay display selection.
- Enable **Reduce motion** in Settings if you prefer fewer interface animations.
- Open **Help → Changelog** for the changes in each version, newest first.
- Open **Help → Guide** to replay the guided tour.

The Sector launch animation appears only when starting the app. Click or press
any key to skip it. Reopening Sector from the tray does not replay it.

- Choose **Run in background** when closing the window to keep Sector active.
- Reopen it from the Windows notification area or by launching `Sector.exe` again.
- Choose **Quit Sector** to stop the app completely.

## Common problems

### Sector is waiting for LMU

Check that LMU is running from the folder you selected during setup. For Active
Reset, select **Offline** mode in LMU, load **Practice** without EAC and enter **DRIVE**. Keep Sector open
while the session loads, then check the status on the Active Reset page.

### The shortcut does nothing

Return focus to LMU, release both shortcut keys and press the key once. Check
that Sector is connected and that you have saved a checkpoint before restoring.
If LMU uses the same key, choose another in Sector. If Sector shows a rejection
message, use that message to identify what needs changing.

### The overlays are not visible

Check that **Overlays** and the individual widgets are enabled. Confirm the
selected display in Settings. Load a session, bring LMU to the foreground and
use windowed or borderless mode. Live widgets hide when game information is
unavailable or when another app is in the foreground.
They also hide while the game is paused. Resume the game before checking the layout.
For online sessions, keep EAC enabled and check the Overlay page separately from
Active Reset, which remains disabled. Some opponent readings may not be supplied
by LMU online; unavailable values appear as `-`.

### Active Reset says the car or game version is unsupported

Sector checks the installed LMU version before connecting. After a game update,
check [Sector Releases](https://github.com/sector-lmu/Sector/releases/latest)
for a compatible version. A game version warning is different from a damaged-car
warning: for the latter, repair the car or start a fresh Practice and save again.

### The widgets are catching mouse clicks

Select **Lock layout** or press **Escape** to leave layout editing. Locked
widgets let mouse input pass through to the game.

### Sector disappeared after I closed its window

If you chose **Run in background**, it is still running. Look for its icon beside
the Windows clock, including inside the hidden-icons menu, or launch Sector again.
Choose **Quit Sector** in the close dialog when you want to stop it.

### I cannot find Sector.exe after downloading

Make sure you downloaded the Windows app ZIP from the release's **Assets**, then
extracted it. GitHub's **Source code** ZIP is for developers and does not contain
the ready-to-use application. If no Windows package is attached, one has not been
published on that release yet.

## Update Sector

1. Close Sector using **Quit Sector**.
2. Download the new Windows package and extract it into a new folder.
3. Launch `Sector.exe` from that folder and update any desktop shortcut you use.

Keep all files in the new package together. Your settings and first-run choices
are stored separately and are retained between versions. If Sector requests an
LMU restart, restart the game before creating your next checkpoint.

To back up preferences, close Sector and copy the `LMUActiveReset` folder from
`%LOCALAPPDATA%` to a safe location. You can paste `%LOCALAPPDATA%` into File
Explorer's address bar. This backs up settings and layout, not game checkpoints.

## Get more help

### Export diagnostics

This is an experimental pre-release: bugs are expected and further fixes are
planned. Version 0.2.15 accepts models without deformable bodywork components.
Active Reset supports fuel consumption and tyre wear enabled or disabled;
leave those settings as you prefer. The app restores the saved state and does
not change your session settings. After changing session settings, start a new
Practice and save a new checkpoint.

1. Quit Sector completely and restart LMU after upgrading to 0.2.15.
2. Reproduce the problem. For Active Reset, use Offline Practice without EAC.
3. Open **Help → Export diagnostics → Save diagnostic file**.
4. Choose a folder and share the resulting JSON file with your bug report.

You can export after leaving or restarting the game: recent logs remain on disk
in the same Sector version. Export before switching to another version. Include
the vehicle and whether the failure happened with F6 or F7 if they are not
available in the captured session context.

The file contains recent text logs and system graphics information, with bounded
size and masked Windows user-directory names. Memory dumps, raw physics captures
and checkpoint data are excluded. Exporting does not upload or send the file.

Open an [issue on GitHub](https://github.com/sector-lmu/Sector/issues) with the
Sector version you are using, what you were doing and the exact message shown
by the app. A screenshot can help explain a display problem.

Development and build instructions are in [Contributing](../CONTRIBUTING.md).
