import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { PrivySignIn } from "@/components/auth/privy-sign-in";
import { SetupNotice } from "@/components/auth/setup-notice";
import { readAuthEnv, setupProblems } from "@/lib/auth/env";
import { safeNext } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
    const params = await searchParams;
    const next = safeNext(typeof params.next === "string" ? params.next : null);
    const env = readAuthEnv();
    const production = process.env.NODE_ENV === "production";
    const problems = env ? [] : setupProblems();
    if (problems.length > 0 && production) console.error("[auth] Sign-in is not set up:", problems.join("; "));

    return (
        <AuthCard classifier="Sign in">
            {env ? (
                <PrivySignIn appId={env.appId} next={next} signedOut={params.signed_out === "1"} />
            ) : (
                <SetupNotice problems={production ? [] : problems} />
            )}
        </AuthCard>
    );
}
