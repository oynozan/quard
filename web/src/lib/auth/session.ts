import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAuthEnv } from "./env";
import { sessionFromToken } from "./gate";
import { LOCAL_SESSION, skipsSignIn } from "./skip";
import { SESSION_COOKIE, type Session } from "./session-token";

// The signed-in person for this request, or null.
export async function getSession(): Promise<Session | null> {
    if (skipsSignIn()) return LOCAL_SESSION;
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return sessionFromToken(token, readAuthEnv());
}

// For server components behind sign-in: without a session the visitor goes to the sign-in page.
export async function requireSession(): Promise<Session> {
    const session = await getSession();
    if (!session) redirect("/sign-in");
    return session;
}
