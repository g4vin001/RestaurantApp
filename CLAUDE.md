# Project
Next.js 14 App Router, TypeScript, PRISMA schema, PostgreSQL and SUPABASE, Tailwind. Waitlist app for a restaurant.

## Conventions
- Path alias `@/` → ./src
- Components in src/components, one export per file
- Types live in src/lib/types.ts, imported with `import type`
- Any future schema change needs the same explicit override — npx prisma db push --url="$DIRECT_URL"

## Current state
Queue list + status badges + login AUTH + front-end manager views + initial reservation systems done. 
No data layer yet — entries are hardcoded. There is a demo mode to skip AUTH and to see the hardcoded 
entries.

## Where I'm stuck / what's next
- Manager-side actions on reservations
- Customer-end live floor view
- SMS / Email bots
