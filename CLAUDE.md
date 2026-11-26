# Tidely: project rules

## Every change is written up for users

Tidely shows its version history to users (the 🕘 button at the bottom of each page).
**Any change a user can see or feel must be documented in the same commit:**

1. Add a new entry at the **top** of `src/changelog.js` (newest first): `version`,
   `date` (YYYY-MM-DD), a short `title`, and one `changes` item per thing that changed,
   each with `kind` `'new'`, `'improved'` or `'fixed'`.
2. Bump `"version"` in `package.json` to the same number, then run
   `npm install --package-lock-only`.
3. Write for a boater, not a programmer: say what changed and why it helps. No file
   names, library names or internal terms. End each item with a full stop.

Version numbers: first number for a redesign, second for new features, third for fixes
only. Several related changes made together share one version.

Purely internal work (tests, refactoring, server code that is not switched on) does not
need an entry, but if in doubt, add one.

`npm test` fails if the newest changelog entry and `package.json` disagree, or if an
entry is malformed, and the deploy workflow runs the tests, so an undocumented version
bump cannot ship.

## Other conventions

- Wording follows mariners' usage (see README → Language and units): high water / low
  water, flood / ebb, observed / predicted, knots, nautical miles, 24-hour clock.
- Prefer graphics over text; every graphic needs a text alternative (`aria-label`).
- Run `npm run lint`, `npm test` and `npm run build` before committing; `server/` has
  its own `npm test`.
