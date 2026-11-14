import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/offline$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/api\/health$/, /^\/api\/cron\//];

// First gate only: it redirects visitors without a session cookie. The real
// session + role checks run on the server in every page and action.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("phoenix_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
