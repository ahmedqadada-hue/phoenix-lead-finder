/** Only same-site relative paths are accepted as "return to" targets (prevents open redirects). */
export function safeBack(value: FormDataEntryValue | null | undefined, fallback: string): string {
  const v = typeof value === "string" ? value : "";
  return /^\/(?![/\\])/.test(v) && !/[\r\n]/.test(v) ? v : fallback;
}
