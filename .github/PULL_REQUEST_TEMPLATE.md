<!-- Thanks for contributing to GlanceOS! Keep PRs focused — one logical change. -->

## What & why

<!-- What does this change, and what problem does it solve? Link any issue (Fixes #123). -->

## How to test

<!-- Steps a reviewer can follow to see it work. -->

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `pnpm --filter @glanceos/screen size` is within budget (≤ 30 KB gzip) — or this PR doesn't touch `apps/screen`
- [ ] No `zod` import was added to `apps/screen`
- [ ] Any schema change is **additive** (optional + defaulted); any DB migration is a **new** additive file
- [ ] Added/updated tests where it makes sense
- [ ] Adding a provider? Bumped `registry.test.ts` and ran `node apps/server/scripts/gen-integrations-doc.mjs --write`
- [ ] Adding a template? It's validated by `starterTemplates.test.ts`
