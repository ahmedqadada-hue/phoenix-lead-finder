"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { safeBack } from "@/lib/safeBack";
import { audit, createSession, destroySession, requireUser } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { rateLimit, resetRateLimit } from "@/lib/ratelimit";
import { ensureDefaultConnections } from "@/lib/providers/connections";

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();
  const key = `login:${ip}:${email}`;
  if (!rateLimit(key, 6, 15 * 60_000).ok || !rateLimit(`login-ip:${ip}`, 30, 15 * 60_000).ok) redirect("/login?error=RATE_LIMIT");
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  // Always run a hash comparison so response time does not reveal whether the e-mail exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5Yq1x8Yh0m3mY0mOQ8mHcQ9k1p3hXqW");
  if (!user || !ok || !user.active) redirect("/login?error=INVALID");
  resetRateLimit(key);
  await createSession(user.id);
  await audit(user, "LOGIN");
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const setupSchema = z.object({ organization: z.string().trim().min(2).max(100), name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(200), password: z.string().max(200) });

/** Creates the first administrator. Only possible while the database has no users at all. */
export async function setupAction(formData: FormData) {
  if (!rateLimit(`setup:${await clientIp()}`, 10, 15 * 60_000).ok) redirect("/setup?error=RATE_LIMIT");
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/setup?error=INVALID_INPUT");
  const d = parsed.data;
  const problem = passwordProblem(d.password);
  if (problem) redirect(`/setup?error=${problem}`);
  const passwordHash = await hashPassword(d.password);
  const user = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
    if ((await tx.user.count()) > 0) return null;
    const org = await tx.organization.create({ data: { name: d.organization, agencyName: d.organization } });
    return tx.user.create({ data: { organizationId: org.id, email: d.email, name: d.name, passwordHash, role: "ADMIN" } });
  });
  if (!user) redirect("/login?error=SETUP_DONE");
  await ensureDefaultConnections(user.organizationId);
  await createSession(user.id);
  await audit(user, "SETUP_FIRST_ADMIN");
  redirect("/");
}

export async function setLocaleAction(formData: FormData) {
  const locale = formData.get("locale") === "en" ? "en" : "ar";
  (await cookies()).set("locale", locale, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  const u = await requireUser().catch(() => null);
  if (u) await db.user.update({ where: { id: u.id }, data: { locale } });
  redirect(safeBack(formData.get("back"), "/"));
}

export async function changePasswordAction(formData: FormData) {
  const u = await requireUser();
  const current = String(formData.get("current") ?? ""), next = String(formData.get("next") ?? "");
  if (!(await verifyPassword(current, u.passwordHash))) redirect("/settings?error=WRONG_PASSWORD#password");
  const problem = passwordProblem(next);
  if (problem) redirect(`/settings?error=${problem}#password`);
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await createSession(u.id);
  await audit(u, "CHANGE_PASSWORD");
  redirect("/settings?ok=PASSWORD_CHANGED#password");
}
