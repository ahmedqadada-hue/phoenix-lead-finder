// Creates (or resets) an administrator from the command line.
// Usage:  ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='...' npm run create-admin
// The password is read from the environment so it never appears in the command history of the app.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME ?? "Administrator";
  const orgName = process.env.ORG_NAME ?? "My Agency";
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid e-mail address.");
  if (password.length < 10 || !/\d/.test(password)) throw new Error("Set ADMIN_PASSWORD (at least 10 characters, with letters and numbers).");
  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { email }, data: { passwordHash, role: "ADMIN", active: true } });
    await db.session.deleteMany({ where: { userId: existing.id } });
    console.log(`Administrator ${email} updated (password reset).`);
  } else {
    const org = (await db.organization.findFirst()) ?? (await db.organization.create({ data: { name: orgName, agencyName: orgName } }));
    await db.user.create({ data: { organizationId: org.id, email, name, passwordHash, role: "ADMIN" } });
    await db.providerConnection.upsert({ where: { organizationId_kind_provider: { organizationId: org.id, kind: "SEARCH", provider: "osm" } }, update: {}, create: { organizationId: org.id, kind: "SEARCH", provider: "osm" } });
    console.log(`Administrator ${email} created.`);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
