import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function passwordProblem(p: string): "TOO_SHORT" | "TOO_WEAK" | null {
  if (p.length < 10) return "TOO_SHORT";
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) return "TOO_WEAK";
  return null;
}
