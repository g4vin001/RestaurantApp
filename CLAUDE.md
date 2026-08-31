# Project

Halina is a Next.js App Router, TypeScript, Prisma, PostgreSQL/Supabase, and
Tailwind restaurant-operations application. Use Node.js 22 or newer.

## Conventions

- Path alias `@/` → ./src
- Components in src/components, one export per file
- Types live in src/lib/types.ts, imported with `import type`
- Treat the root `AGENTS.md` as the repository source of truth.
- Use the pooled `DATABASE_URL` on port 6543 for runtime traffic.
- Use `DIRECT_URL` on port 5432 for Prisma migration commands.
- Review `npx prisma migrate status`, inspect committed migration SQL, then use
  `npx prisma migrate deploy`. Never use `prisma db push` or reset a shared
  database.

## Current state

The authenticated Manager workspace, public restaurant projection, restricted
staff operations, staff invitations, transactional queue/reservation/table
commands, floor-plan persistence, analytics, and the TEST-only Admin Data Lab
are database-backed. Demo mode remains an explicit browser-local mode and never
silently replaces failed database reads.

## Release discipline

- Run lint, typecheck, unit/integration tests, Playwright, and a production build
  before release.
- Apply committed migrations through `DIRECT_URL` before deploying code that
  depends on them.
- Verify the deployed revision, authenticated workflows, public TEST exclusion,
  and Vercel runtime logs. A successful build alone is not sufficient.
- Do not commit `.env`, `.env.local`, generated Prisma output, or credentials.
