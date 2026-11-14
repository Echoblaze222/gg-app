# GG Contribution

A savings platform: members save on a daily, weekly or monthly schedule and request their money back when they need it. One owner administers it.

Status: rebuild in progress. Read these first:
1. `RESEARCH.md` (if present) and the source pack
2. `docs/architecture/00-implementation-map.md` (what the legacy app was)
3. `docs/architecture/01-vision-and-protocol.md` (vision, invariants, working method)
4. `contracts/README.md` (frozen interfaces between workstreams)
5. `docs/architecture/ownership.md` (who owns which path)

## Commands
```
npm install
npm run dev          # local app
npm run typecheck
npm run lint
npm test             # contract and unit tests
npm run test:db      # database and RLS tests (needs TEST_DATABASE_URL)
npm run build
```

Copy `.env.example` to `.env.local` and fill in values. Never commit real values. The legacy code is preserved on the git branch `legacy-v0`. Do not delete that branch.

This project uses a Next.js version with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
