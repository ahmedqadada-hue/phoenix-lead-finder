"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";

const createSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(200), role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]), password: z.string().max(200) });

export async function createUserAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const r = createSchema.safeParse(Object.fromEntries(formData));
  if (!r.success) redirect("/users?error=INVALID_INPUT");
  const problem = passwordProblem(r.data.password);
  if (problem) redirect(`/users?error=${problem}`);
  if (await db.user.findUnique({ where: { email: r.data.email } })) redirect("/users?error=EMAIL_TAKEN");
  const nu = await db.user.create({ data: { organizationId: u.organizationId, name: r.data.name, email: r.data.email, role: r.data.role, passwordHash: await hashPassword(r.data.password) } });
  await audit(u, "USER_CREATE", "User", nu.id, { role: nu.role });
  redirect("/users?ok=SAVED");
}

async function activeAdmins(organizationId: string, excludeId: string) {
  return db.user.count({ where: { organizationId, role: "ADMIN", active: true, id: { not: excludeId } } });
}

export async function updateUserAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const target = await db.user.findFirst({ where: { id: String(formData.get("id")), organizationId: u.organizationId } });
  if (!target) redirect("/users?error=FORBIDDEN");
  const role = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).catch(target.role).parse(formData.get("role"));
  const active = formData.get("active") === "on";
  if (target.role === "ADMIN" && target.active && (role !== "ADMIN" || !active) && (await activeAdmins(u.organizationId, target.id)) === 0) redirect("/users?error=LAST_ADMIN");
  await db.user.update({ where: { id: target.id }, data: { role, active } });
  if (!active) await db.session.deleteMany({ where: { userId: target.id } });
  const pw = String(formData.get("password") ?? "");
  if (pw) {
    const problem = passwordProblem(pw);
    if (problem) redirect(`/users?error=${problem}`);
    await db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(pw) } });
    await db.session.deleteMany({ where: { userId: target.id } });
  }
  await audit(u, "USER_UPDATE", "User", target.id, { role, active, passwordReset: !!pw });
  redirect("/users?ok=SAVED");
}
