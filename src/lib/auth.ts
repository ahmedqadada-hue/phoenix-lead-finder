import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import type { Role, User } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./crypto";

export const SESSION_COOKIE = "phoenix_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } }); // only a hash is stored
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return s.user;
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Server-side authorisation. Every page and server action calls this; hiding a button is never the only check. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/?error=FORBIDDEN");
  return u;
}

export const isManager = (u: Pick<User, "role">) => u.role === "ADMIN" || u.role === "MANAGER";

/** Employees only ever see leads assigned to them. */
export function leadScope(u: Pick<User, "id" | "role" | "organizationId">) {
  return { organizationId: u.organizationId, ...(isManager(u) ? {} : { assignedToId: u.id }) };
}

export async function audit(u: Pick<User, "id" | "organizationId">, action: string, entity = "", entityId = "", meta?: Record<string, unknown>) {
  await db.auditLog.create({ data: { organizationId: u.organizationId, userId: u.id, action, entity, entityId, meta: meta as any } }).catch(() => {});
}
