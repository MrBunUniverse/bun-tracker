# Adding a special theme

Special themes live in the spike's GUI copy at `tauri-spike/latest/gui`. Bun is the first one.

## Checklist

1. **Add the theme block** in `gui/src/index.scss`: `:root[data-theme='<name>'] { … }`.
   Set **every** colour token the app uses, not only the text and accent colours.
   A token left out falls back to the base `:root` values, and that's how a page keeps the default colours.
2. **Run the checker:**

   ```bash
   python3 tauri-spike/tools/check-theme-tokens.py <name>
   ```

   It exits 1 and lists every colour token still missing. Fix them all before testing.
3. **Add the option** to `gui/src/components/settings/pages/SpecialThemesSettings.tsx`, with its strings in `gui/public/i18n/en/translation.ftl`.
4. **Check the light/night toggle.** `ThemeModeToggle` is hidden for `bun`. Hide it for any new special theme too, by adding its name to the same `if`.
5. **Check the pages that hardcode colours.** These don't follow any theme:
   - `components/settings/pages/Serial.tsx` (`bg-[#100E0B]`)
   - `components/remote/RemotePage.tsx` (`bg-[#1B1915]`, `bg-white`)
   - `components/home/Home.tsx` and `components/settings/pages/VRCOSCSettings.tsx` (`bg-white`)
   - `components/widgets/*Visualizer*` (the skeleton colours)

   Status colours (green, amber, red) on `HomeEmptyState.tsx` are intentional.
6. **Screenshot these screens** in the new theme: Home (waiting for trackers, the Quest strip, the 3D preview), Settings → Appearance, Special themes, and one settings page with cards.
7. **Confirm the theme survives** navigation and a restart, since `AppLayout` reads `config.theme` on every load.

## Known limits

- The checker only checks colour tokens. Sizes, fonts, and motion are not covered.
- Hardcoded colours (checklist item 5) need converting to tokens before a theme can change them.
