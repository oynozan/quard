"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { endSession } from "@/components/auth/lib/exchange";
import { clearSignInNote } from "@/components/auth/lib/sign-in-mark";
import { Glyph } from "@/components/icons/glyphs";
import { Hint } from "@/components/ui/hint";
import { Spinner } from "@/components/ui/spinner";
import { showToast } from "@/components/ui/toast";

type UserRowProps = { title: string; sub: string; style?: CSSProperties; onNavigate?: () => void };

// The signed-in person: the row opens settings, the button at its end signs out.
export function UserRow({ title, sub, style, onNavigate }: UserRowProps) {
    const [leaving, setLeaving] = useState(false);

    async function signOut() {
        setLeaving(true);
        if (!(await endSession())) {
            setLeaving(false);
            showToast("Sign-out failed. Try again.", "sign-out");
            return;
        }
        clearSignInNote();
        // A full page load, so nothing from the signed-in session stays in the client cache.
        window.location.assign(new URL("/sign-in?signed_out=1", window.location.origin));
    }

    return (
        <div className="reveal-row relative flex min-h-[73px] items-stretch border-t border-line" style={style}>
            <Link
                href="/settings"
                onClick={onNavigate}
                className="group flex min-w-0 flex-1 items-center gap-[10px] py-4 pr-[52px] pl-5 hover:bg-nav-hover focus-visible:outline-offset-[-2px]"
            >
                <span className="grid size-[29px] shrink-0 place-items-center rounded-sm bg-tile opacity-75">
                    <UserRound size={18} strokeWidth={0.75} />
                </span>
                <span className="min-w-0 flex-1">
                    <strong className="mono block truncate text-[14px] font-normal text-ink">{title}</strong>
                    <small className="block text-[12px] text-ink-muted">{sub}</small>
                </span>
                <Glyph
                    name="chevronRight"
                    size={18}
                    aria-hidden
                    className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                />
            </Link>
            <Hint content="Sign out">
                <button
                    type="button"
                    aria-label="Sign out"
                    disabled={leaving}
                    onClick={() => void signOut()}
                    className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-2 hover:bg-control-hover hover:text-ink-bright"
                >
                    {leaving ? <Spinner /> : <LogOut size={16} strokeWidth={0.75} />}
                </button>
            </Hint>
        </div>
    );
}
