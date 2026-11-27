import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (process.env.CI !== "true" || !process.env.GITHUB_ENV) {
  throw new Error("This helper only configures disposable GitHub Actions services.");
}
const local = JSON.parse(process.argv.includes("--status-stdin")
  ? readFileSync(0, "utf8")
  : execFileSync("supabase", ["status", "--workdir", "test", "-o", "json"], { encoding: "utf8" }));
for (const key of ["API_URL", "DB_URL"]) {
  if (!local[key] || !["127.0.0.1", "localhost"].includes(new URL(local[key]).hostname)) {
    throw new Error("Authenticated CI must use local Supabase services.");
  }
}
const adminEmail = `review-admin-${randomUUID()}@example.com`;
const loginPassword = `Local-CI-only-${randomUUID()}!`;
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await service.auth.admin.createUser({ email: adminEmail, password: loginPassword, email_confirm: true });
if (error || !data.user) throw new Error("Could not create the local platform administrator");
const values = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  HALINA_E2E_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  DATABASE_URL: local.DB_URL,
  DIRECT_URL: local.DB_URL,
  ADMIN_EMAIL: adminEmail,
  ADMIN_USER_ID: data.user.id,
  ADMIN_PANEL_PASSWORD: `Local-unlock-${randomUUID()}!`,
  HALINA_E2E_ADMIN_PASSWORD: loginPassword,
  HALINA_E2E_MAILPIT_URL: local.MAILPIT_URL ?? local.INBUCKET_URL ?? "http://127.0.0.1:54324",
  HALINA_RATE_LIMIT_SECRET: randomUUID(),
};
for (const [key, value] of Object.entries(values)) {
  if (typeof value !== "string" || !value || /[\r\n]/.test(value)) throw new Error(`Missing local CI setting: ${key}`);
  // Prevent even these disposable local credentials appearing in later logs.
  console.log(`::add-mask::${value}`);
  appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
