import { execSync } from "node:child_process";

// Applies the real migrations to the dedicated TEST database before the suite runs.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://phoenix:phoenix@localhost:5432/phoenix_test";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
