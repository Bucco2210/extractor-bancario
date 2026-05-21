import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const RUTAS_PUBLICAS = new Set<string>(["/login"]);
/** Prefijos públicos: /registro/<token> (aceptar invitación). */
const PREFIJOS_PUBLICOS = ["/registro/"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();
  if (RUTAS_PUBLICAS.has(pathname)) return NextResponse.next();
  if (PREFIJOS_PUBLICOS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
