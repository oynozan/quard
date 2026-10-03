"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

// Privy will not start over plain http outside localhost, so say that instead of showing a crash.
export default function SignInError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    const plainHttp =
        typeof window !== "undefined" &&
        window.location.protocol === "http:" &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname);

    return (
        <AuthCard classifier="Sign in">
            <h1 className="text-[23px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">
                Sign-in could not start
            </h1>
            <p className="mt-3 text-[13px] text-ink-2">
                {plainHttp ? "Open this page over HTTPS, or on localhost." : "Try again in a minute."}
            </p>
            <Button className="mt-6" onClick={() => retry()}>
                Try again
            </Button>
        </AuthCard>
    );
}
