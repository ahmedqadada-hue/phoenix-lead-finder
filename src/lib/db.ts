import { PrismaClient } from "@prisma/client";
// @ts-expect-error plain ESM helper shared with the build script
import { pickDatabaseUrl } from "../../scripts/db-url.mjs";

function create() {
  // Hosts name the connection string differently (DATABASE_URL, POSTGRES_URL, …).
  const found = pickDatabaseUrl(process.env, false) as { name: string; url: string } | null;
  return found ? new PrismaClient({ datasourceUrl: found.url }) : new PrismaClient();
}

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const db = g.__prisma ?? create();
if (process.env.NODE_ENV !== "production") g.__prisma = db;
