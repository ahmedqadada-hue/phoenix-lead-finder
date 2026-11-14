// Build entry point for Vercel: generate the Prisma client, apply migrations, build Next.js.
import { execSync } from "node:child_process";
import { databaseLikeNames, pickDatabaseUrl } from "./db-url.mjs";

const run = (cmd, env) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const migrate = pickDatabaseUrl(process.env, true);
const runtime = pickDatabaseUrl(process.env, false);

if (!migrate || !runtime) {
  const names = databaseLikeNames();
  console.error("\n==================================================================");
  console.error("Phoenix Lead Finder: NO DATABASE IS CONNECTED TO THIS PROJECT.");
  console.error("In Vercel open the project > Storage > Create Database > choose a");
  console.error("Postgres database (Neon or Prisma Postgres, free plan) > Connect it");
  console.error("to this project, then redeploy.");
  console.error(names.length ? `Database-related variables found (names only): ${names.join(", ")}` : "No database-related environment variables were found.");
  console.error("==================================================================\n");
  process.exit(1);
}
console.log(`Database: migrations use ${migrate.name}, the app uses ${runtime.name}.`);
run("npx prisma generate", { DATABASE_URL: runtime.url });
run("npx prisma migrate deploy", { DATABASE_URL: migrate.url });
run("npx next build", { DATABASE_URL: runtime.url });
