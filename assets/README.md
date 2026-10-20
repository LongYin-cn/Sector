# Sector assets

| Asset | Purpose |
| --- | --- |
| `sector-logo.png` | Transparent source mark for Sector |
| `sector-logo-orange.png` | Transparent orange variant for the Design B desktop and splash |
| `sector.ico` | Windows application/tray icon at 16, 24, 32, 48, 64, 128 and 256 pixels |

The blue geometric S mark was generated with the image-generation tool on
16 October 2026 for Sector. It represents interlocking track sectors and layered
information. The source mark has no background tile, lettering or embedded UI.

The orange PNG was edited with the built-in image-generation tool on
20 October 2026 from `sector-logo.png`. The original blue asset is preserved.
The edit prompt requested the same S-shaped hexagonal geometry and rounded
terminals in flat burnt orange `#C2410C`, with transparent negative spaces,
no text, no background, no shadow and cleaned edges. The desktop uses the
orange variant; its CSS mask follows the theme's exact accent color.

To rebuild the Windows icon from the repository root:

```powershell
powershell -STA -File scripts/build/Build-SectorIcon.ps1
```

The desktop uses locally bundled Solar Linear SVG icons, separate from the
Sector mark. Overlay manufacturer artwork comes from the user-supplied logo
sheet, with Genesis supplied by its official website. These marks belong to
their respective owners. See [third-party notices](../src/ui/electron/THIRD_PARTY_NOTICES.md)
for icon attribution and font licenses.
