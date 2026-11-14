/** Copies text with the modern API, falling back to a hidden textarea.
 *  Returns false when the browser refuses both, so the UI can show the text for manual copying. */
export async function copyText(text: string, env: { navigator?: any; document?: any } = globalThis as any): Promise<boolean> {
  try {
    if (env.navigator?.clipboard?.writeText) { await env.navigator.clipboard.writeText(text); return true; }
  } catch { /* permission denied or insecure context: try the fallback */ }
  try {
    const doc = env.document;
    if (!doc?.createElement) return false;
    const ta = doc.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.top = "0";
    doc.body.appendChild(ta); ta.select();
    const ok = !!doc.execCommand?.("copy");
    doc.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
