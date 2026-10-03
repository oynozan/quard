"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Field } from "@/components/kit/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isEmail } from "@/lib/mask";

type Phase = "idle" | "busy" | "done";

function emailProblem(value: string): string | null {
    if (!value.trim()) return "Enter the email your admin invited.";
    if (!isEmail(value)) return "Check for a missing @ or domain.";
    return null;
}

// A mock sign-in: it posts nowhere and opens the overview when both fields look right
export function SignInForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailIssue, setEmailIssue] = useState<string | null>(null);
    const [passwordIssue, setPasswordIssue] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [phase, setPhase] = useState<Phase>("idle");
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const busy = phase !== "idle";

    async function submit(event: FormEvent) {
        event.preventDefault();
        const emailError = emailProblem(email);
        const passwordError = password ? null : "Enter your password.";
        setEmailIssue(emailError);
        setPasswordIssue(passwordError);
        setFailed(false);
        if (emailError || passwordError) {
            (emailError ? emailRef : passwordRef).current?.focus();
            return;
        }
        setPhase("busy");
        await new Promise((resolve) => setTimeout(resolve, 900));
        // Stand-in for the server check until auth exists
        if (password.length < 8) {
            setPhase("idle");
            setFailed(true);
            setPassword("");
            passwordRef.current?.focus();
            return;
        }
        setPhase("done");
        router.push("/");
    }

    return (
        <>
            <h1 className="text-[23px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">Sign in to Quard</h1>
            <form className="mt-[22px]" onSubmit={submit} noValidate>
                <Field label="Email" htmlFor="sign-in-email" problem={emailIssue}>
                    <Input
                        ref={emailRef}
                        id="sign-in-email"
                        type="email"
                        autoComplete="username"
                        placeholder="name@acme.com"
                        value={email}
                        disabled={busy}
                        onChange={(event) => {
                            setEmail(event.target.value);
                            if (emailIssue && !emailProblem(event.target.value)) setEmailIssue(null);
                        }}
                        onBlur={() => email.trim() && setEmailIssue(emailProblem(email))}
                    />
                </Field>
                <Field label="Password" htmlFor="sign-in-password" problem={passwordIssue}>
                    <Input
                        ref={passwordRef}
                        id="sign-in-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        disabled={busy}
                        onChange={(event) => {
                            setPassword(event.target.value);
                            if (passwordIssue && event.target.value) setPasswordIssue(null);
                        }}
                    />
                </Field>

                {failed ? (
                    <ErrorBox className="mt-0 mb-[18px]">
                        Email or password is wrong. Passwords are case-sensitive.
                    </ErrorBox>
                ) : null}

                <Button type="submit" variant="default" busy={busy} className="mt-2">
                    {phase === "busy" ? "Signing in…" : phase === "done" ? "Opening overview…" : "Sign in"}
                </Button>
            </form>
        </>
    );
}
