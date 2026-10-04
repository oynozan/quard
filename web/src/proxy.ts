import { NextResponse, type NextRequest } from "next/server";
import { readAuthEnv } from "@/lib/auth/env";
import { sessionFromToken } from "@/lib/auth/gate";
import { safeNext } from "@/lib/auth/redirect";
import { LOCAL_SESSION, skipsSignIn } from "@/lib/auth/skip";
import { SESSION_COOKIE } from "@/lib/auth/session-token";

// The health check is open so Docker and load balancers can probe it
const PUBLIC_PATHS = ["/sign-in", "/api/auth/session", "/api/health"];

// Every page and API route needs a valid session. Without one, pages send people to sign in.
export async function proxy(request: NextRequest) {
    const { pathname, search, searchParams } = request.nextUrl;
    const skip = skipsSignIn();
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = skip ? LOCAL_SESSION : await sessionFromToken(token, readAuthEnv());

    if (PUBLIC_PATHS.includes(pathname)) {
        // Someone already signed in skips the sign-in page. With sign-in skipped, the page stays visible.
        if (session && !skip && pathname === "/sign-in") {
            return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url));
        }
        return NextResponse.next();
    }
    if (session) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const target = new URL("/sign-in", request.url);
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
}

// Static build files and the icon load without a session; everything else goes through the check.
export const config = {
    matcher: ["/((?!_next/static/|_next/image$|icon\\.svg$|favicon\\.ico$).*)"],
};
