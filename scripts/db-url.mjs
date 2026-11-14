// Finds the PostgreSQL connection string under the names different hosts use.
// Vercel database integrations (Neon, Prisma Postgres, Supabase…) do not all call it DATABASE_URL.
const RUNTIME = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];
const MIGRATE = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"];
const usable = (v) => typeof v === "string" && /^postgres(ql)?:\/\//i.test(v.trim());

export function pickDatabaseUrl(env = process.env, forMigrations = false) {
  for (const name of forMigrations ? MIGRATE : RUNTIME) if (usable(env[name])) return { name, url: env[name].trim() };
  // Integrations may add a custom prefix, e.g. STORAGE_DATABASE_URL or MYDB_POSTGRES_URL.
  const keys = Object.keys(env).filter((k) => /(DATABASE_URL|POSTGRES_URL)/.test(k) && usable(env[k]));
  const prefer = forMigrations ? keys.find((k) => /UNPOOLED|NON_POOLING/.test(k)) : keys.find((k) => !/UNPOOLED|NON_POOLING/.test(k));
  const name = prefer ?? keys[0];
  return name ? { name, url: env[name].trim() } : null;
}

/** Names only (never values) of variables that look database-related: used in error messages. */
export function databaseLikeNames(env = process.env) {
  return Object.keys(env).filter((k) => /(DATABASE|POSTGRES|PGHOST|PGUSER|NEON|PRISMA|SUPABASE)/i.test(k)).sort();
}
