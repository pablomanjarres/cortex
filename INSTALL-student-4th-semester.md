# Install — Student semesters (data-driven)

The Student page is now **fully data-driven**: semesters and courses live in your
data store and are managed in-app (no code change / rebuild for future terms).
It's built, merged to `main`, and packaged. The only remaining step is copying the
new app into `/Applications`, which has to run from your own shell (a background
job can't write to `/Applications`).

## Finish the install

Paste this into the Claude Code prompt with the leading `!` (runs in your shell):

```
! osascript -e 'tell application "Cortex" to quit'; while pgrep -f 'Cortex.app/Contents/MacOS/Cortex' >/dev/null; do :; done; rm -rf /Applications/Cortex.app && cp -R ~/Projects/cortex/release/mac-arm64/Cortex.app /Applications/Cortex.app && xattr -cr /Applications/Cortex.app && for h in "Electron Framework.framework" "Cortex Helper.app" "Cortex Helper (GPU).app" "Cortex Helper (Plugin).app" "Cortex Helper (Renderer).app"; do codesign --force --sign - "/Applications/Cortex.app/Contents/Frameworks/$h"; done && codesign --force --sign - /Applications/Cortex.app && open /Applications/Cortex.app
```

It quits Cortex, swaps in the already-built/signed app at
`~/Projects/cortex/release/mac-arm64/Cortex.app`, re-signs, and reopens it.
**No rebuild needed.**

Alternative (rebuilds from scratch, slower): `! cd ~/Projects/cortex && npm run cortex:install`

## What you can do after this (Student page)

- **Switch semesters** — chips at the top (3rd / 4th + any you add).
- **Create a semester** — `+ Semester`, type a name (e.g. "5th Semester"), Enter.
- **Delete an empty semester** — the `×` on a semester chip (only shows when it has no courses).
- **Add a course** — the dashed `+ Add course` card in the grid; auto-styled, lands in the active semester, and is auto-selected so you can add assignments immediately.
- **Edit a course** — click it, then in the detail panel edit name (click it), icon (click the icon to cycle), difficulty / status / semester (dropdowns), and credits (click the number).
- **Delete a course** — trash icon in the course detail header (removes its assignments + topics too).
- **Add assignments** — select a course → `Add` in the All Assignments card.
- **Add topics** — `+ Add` in the course detail panel.

Your existing 3rd + 4th semester data seeds automatically on first load; existing
assignments/topics stay linked by course id.

## Status (done)

- Merged to `main` (`6c49a10`)
- `tsc` typecheck — clean
- `npm run build` + `electron:compile` + `electron-builder` — all green
- New code verified present in the packaged `app.asar`
