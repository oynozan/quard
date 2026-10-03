"use client";

import { Captcha, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { Field } from "@/components/kit/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { GitHubMark } from "./github-mark";
import { isEmail } from "./lib/email";
import { exchangeToken } from "./lib/exchange";
import { privyErrorCode, privyProblem } from "./lib/privy-errors";
import { cookieWasDropped, noteSignIn } from "./lib/sign-in-mark";

type SignInPanelProps = { next: string; signedOut: boolean };
type Phase = "idle" | "dropping" | "finishing";

// Privy allows five tries per code; after that only a new code helps.
const MAX_TRIES = 5;
const TEXT_BUTTON =
    "rounded-[2px] text-[13px] text-ink-link underline decoration-line-hover underline-offset-[3px] hover:text-ink-bright hover:decoration-ink-2 disabled:opacity-45";

// GitHub or an emailed code through Privy. Privy only proves who this is: our server sets the session
// cookie and the Privy session ends right away, so signing out of Quard is all it takes.
export function SignInPanel({ next, signedOut }: SignInPanelProps) {
    const { ready, getAccessToken, logout } = usePrivy();
    const [email, setEmail] = useState("");
    const [emailProblem, setEmailProblem] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [codeStep, setCodeStep] = useState(false);
    const [tries, setTries] = useState(0);
    const [problem, setProblem] = useState<string | null>(() =>
        !signedOut && cookieWasDropped()
            ? "Your browser did not keep the sign-in. Allow cookies for this site, then try again."
            : null,
    );
    const [status, setStatus] = useState(signedOut ? "You are signed out." : "");
    const [phase, setPhase] = useState<Phase>("idle");
    const [stalled, setStalled] = useState(false);
    const busy = useRef(false);
    const emailRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);

    // Privy that never gets ready usually means a wrong app id or a domain missing from Privy's allowed list.
    useEffect(() => {
        if (ready) return;
        const timer = setTimeout(() => {
            console.warn("[auth] Privy did not get ready. Check NEXT_PUBLIC_PRIVY_APP_ID and the allowed domains.");
            setStalled(true);
        }, 8000);
        return () => clearTimeout(timer);
    }, [ready]);

    async function finish() {
        if (busy.current) return;
        busy.current = true;
        const token = await getAccessToken().catch(() => null);
        setPhase("finishing");
        setProblem(null);
        setStatus("Signing in…");
        const result = await exchangeToken(token);
        await logout().catch(() => undefined);
        if (result.ok) {
            setStatus("Opening Quard…");
            noteSignIn();
            window.location.replace(next);
            return;
        }
        setProblem(result.message);
        setStatus("");
        setCodeStep(false);
        setCode("");
        setPhase("idle");
        busy.current = false;
        requestAnimationFrame(() => emailRef.current?.focus());
    }

    // Privy reports a session left from an earlier visit right away; that one is ended, never reused.
    function onLogin({ wasAlreadyAuthenticated }: { wasAlreadyAuthenticated: boolean }) {
        if (!wasAlreadyAuthenticated) {
            void finish();
            return;
        }
        if (busy.current) return;
        busy.current = true;
        setPhase("dropping");
        void logout()
            .catch(() => undefined)
            .finally(() => {
                busy.current = false;
                setPhase("idle");
            });
    }

    const emailLogin = useLoginWithEmail({ onComplete: onLogin });
    const githubLogin = useLoginWithOAuth({ onComplete: onLogin });

    async function sendCode(event?: FormEvent) {
        event?.preventDefault();
        setProblem(null);
        const address = email.trim();
        if (!isEmail(address)) {
            setEmailProblem("Enter a valid email address.");
            emailRef.current?.focus();
            return;
        }
        setEmailProblem(null);
        try {
            await emailLogin.sendCode({ email: address });
        } catch (error) {
            setProblem(privyProblem(error, "Email", "The code could not be sent. Check the address and try again."));
            return;
        }
        setStatus(codeStep ? `New code sent to ${address}.` : `Code sent to ${address}.`);
        setTries(0);
        setCode("");
        setCodeStep(true);
        requestAnimationFrame(() => codeRef.current?.focus());
    }

    async function submitCode(event: FormEvent) {
        event.preventDefault();
        if (code.length < 6) return;
        setProblem(null);
        try {
            await emailLogin.loginWithCode({ code });
        } catch (error) {
            // A wrong code is expected; anything else gets its own sentence.
            if (privyErrorCode(error) !== "invalid_credentials" && privyErrorCode(error) !== null) {
                setProblem(privyProblem(error, "Email", "That code did not work. Check it or send a new one."));
                return;
            }
            const used = tries + 1;
            setTries(used);
            setCode("");
            setProblem(
                used >= MAX_TRIES
                    ? "Too many tries. Send a new code."
                    : "That code did not work. Check it or send a new one.",
            );
            requestAnimationFrame(() => codeRef.current?.focus());
        }
    }

    async function continueWithGitHub() {
        setProblem(null);
        // GitHub sends people back to this address, so the signed-out note must not ride along.
        const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
        window.history.replaceState(null, "", `${window.location.pathname}${query}`);
        try {
            await githubLogin.initOAuth({ provider: "github" });
        } catch (error) {
            setProblem(privyProblem(error, "GitHub", "GitHub sign-in could not start. Try again."));
        }
    }

    const sending = emailLogin.state.status === "sending-code";
    const checking = emailLogin.state.status === "submitting-code";
    const loading = !ready && !stalled;
    const locked = !ready || phase !== "idle" || githubLogin.loading;
    const spent = tries >= MAX_TRIES;
    const oauthFailed = githubLogin.state.status === "error" ? "GitHub sign-in did not finish. Try again." : null;
    const unavailable = !ready && stalled ? "Sign-in is not available right now. Try again in a minute." : null;
    const shown = problem ?? oauthFailed ?? unavailable;
    const working = loading || phase !== "idle";
    const line = loading ? "Loading sign-in…" : phase === "dropping" ? "Getting sign-in ready…" : status;

    return (
        <>
            <h1 className="text-[23px] leading-[1.3] font-extralight tracking-[-0.2px] text-ink">Sign in to Quard</h1>
            <p role="status" className="mt-2 flex min-h-5 items-center gap-[9px] text-[13px] text-ink-2">
                {working && line ? <Spinner /> : null}
                {line}
            </p>

            {phase === "finishing" ? null : (
                <div className="mt-4">
                    <Button
                        variant="outline"
                        size="tall"
                        className="w-full"
                        disabled={locked}
                        busy={githubLogin.loading}
                        onClick={() => void continueWithGitHub()}
                    >
                        {githubLogin.loading ? null : <GitHubMark />}
                        {githubLogin.loading ? "Opening GitHub…" : "Continue with GitHub"}
                    </Button>

                    <div aria-hidden className="my-5 flex items-center gap-3 text-[12px] text-ink-faint">
                        <span className="h-px flex-1 bg-line" />
                        or
                        <span className="h-px flex-1 bg-line" />
                    </div>

                    {codeStep ? (
                        <form onSubmit={submitCode} noValidate>
                            <Field label={`Code sent to ${email.trim()}`} htmlFor="sign-in-code">
                                <Input
                                    ref={codeRef}
                                    id="sign-in-code"
                                    mono
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={code}
                                    readOnly={checking}
                                    disabled={spent}
                                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                            </Field>
                            <Button
                                type="submit"
                                variant="default"
                                size="tall"
                                className="w-full"
                                busy={checking}
                                disabled={locked || spent || code.length < 6}
                            >
                                {checking ? "Checking code…" : "Sign in"}
                            </Button>
                            <div className="mt-4 flex justify-between gap-3">
                                <button
                                    type="button"
                                    className={TEXT_BUTTON}
                                    disabled={checking}
                                    onClick={() => {
                                        setCodeStep(false);
                                        setCode("");
                                        setProblem(null);
                                        setStatus("");
                                        requestAnimationFrame(() => emailRef.current?.focus());
                                    }}
                                >
                                    Use another email
                                </button>
                                <button
                                    type="button"
                                    className={TEXT_BUTTON}
                                    disabled={locked || checking || sending}
                                    onClick={() => void sendCode()}
                                >
                                    {sending ? "Sending…" : "Send a new code"}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={sendCode} noValidate>
                            <Field label="Email" htmlFor="sign-in-email" problem={emailProblem}>
                                <Input
                                    ref={emailRef}
                                    id="sign-in-email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    readOnly={sending}
                                    onChange={(event) => {
                                        setEmail(event.target.value);
                                        if (emailProblem) setEmailProblem(null);
                                    }}
                                />
                            </Field>
                            <Button
                                type="submit"
                                variant="default"
                                size="tall"
                                className="w-full"
                                busy={sending}
                                disabled={locked}
                            >
                                {sending ? "Sending code…" : "Email me a code"}
                            </Button>
                        </form>
                    )}
                </div>
            )}

            {shown ? <ErrorBox className="mb-0">{shown}</ErrorBox> : null}
            {/* Renders nothing unless bot protection is on in Privy, where headless sign-in needs it. */}
            <Captcha />
        </>
    );
}
