# Project
Next.js 14 App Router, TypeScript, PRISMA schema, PostgreSQL and SUPABASE, Tailwind. Waitlist app for a restaurant.

## Conventions
- Path alias `@/` → ./src
- Components in src/components, one export per file
- Types live in src/lib/types.ts, imported with `import type`
- Schema changes go through migrations, not `db push` (push skips the RLS lockdown below and drops migration-only indexes):
  1. `node --env-file=.env.local node_modules/.bin/prisma migrate dev --create-only --name <name>`
  2. For any new table, append `ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;` and `REVOKE ALL PRIVILEGES ON TABLE "<T>" FROM anon, authenticated;`
  3. `node --env-file=.env.local node_modules/.bin/prisma migrate deploy`
- Prisma CLI reads DIRECT_URL, which lives in .env.local (prisma.config.ts only auto-loads .env), hence `--env-file`. DIRECT_URL must be the IPv4 session pooler (port 5432), not db.<ref>.supabase.co.

## Current state
Queue list + status badges + login AUTH + front-end manager views + initial reservation systems done. 
No data layer yet — entries are hardcoded. There is a demo mode to skip AUTH and to see the hardcoded 
entries.

## Where I'm stuck / what's next
- Manager-side actions on reservations
- Customer-end live floor view
- SMS / Email bots
