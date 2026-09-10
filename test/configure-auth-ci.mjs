import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

if (process.env.CI !== "true" || !process.env.GITHUB_ENV) {
  throw new Error("This helper only configures disposable GitHub Actions services.");
}
const local = JSON.parse(execFileSync("supabase", ["status", "--workdir", "test", "-o", "json"], { encoding: "utf8" }));
for (const key of ["API_URL", "DB_URL"]) {
  if (!local[key] || !["127.0.0.1", "localhost"].includes(new URL(local[key]).hostname)) {
    throw new Error("Authenticated CI must use local Supabase services.");
  }
}
const values = {
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  HALINA_E2E_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  DATABASE_URL: local.DB_URL,
  DIRECT_URL: local.DB_URL,
};
for (const [key, value] of Object.entries(values)) {
  if (typeof value !== "string" || !value || /[\r\n]/.test(value)) throw new Error(`Missing local CI setting: ${key}`);
  // Prevent even these disposable local credentials appearing in later logs.
  console.log(`::add-mask::${value}`);
  appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
}
