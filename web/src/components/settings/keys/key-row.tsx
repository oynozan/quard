"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { NameCell, Td, Tr } from "@/components/kit/data-table";
import { Absent, StatusValue } from "@/components/kit/detail/detail-list";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import type { AgentKey } from "@/lib/data/settings";
import { formatAge, formatLongDate } from "@/lib/format";
import { MINUTE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Ago, FIRST_CELL, ShortDate } from "../shared/table-parts";

type KeyRowProps = {
    item: AgentKey;
    now: number;
    // The key that was just revoked, so its row can take focus
    fresh: boolean;
    // Resolves true once the key is revoked
    onRevoke: () => Promise<boolean>;
};

export function KeyRow({ item, now, fresh, onRevoke }: KeyRowProps) {
    const revoked = item.revokedAt !== null;
    return (
        <Tr className={cn(revoked && "text-ink-muted")}>
            <Td colSpan={2} className={FIRST_CELL}>
                <NameCell
                    icon={<KeyRound size={20} strokeWidth={0.75} className="opacity-80" />}
                    name={<span className={cn(revoked && "text-ink-muted")}>{item.name}</span>}
                    sub={<span className="mono text-[12px]">{item.prefix}…</span>}
                />
            </Td>
            <Td>
                <ShortDate time={item.createdAt} />
            </Td>
            <Td>
                {item.lastUsedAt === null ? (
                    <span className="text-[12px]">
                        <Absent>Not used yet</Absent>
                    </span>
                ) : (
                    <Ago time={item.lastUsedAt} now={now} />
                )}
            </Td>
            <Td className="text-[12px] text-ink-2">
                {item.revokedAt === null ? (
                    <StatusValue tone="on">Active</StatusValue>
                ) : (
                    <RevokedNote revokedAt={item.revokedAt} now={now} focus={fresh} />
                )}
            </Td>
            <Td className="pr-[10px]">
                {revoked ? (
                    <span className="sr-only">No actions</span>
                ) : (
                    <RevokeControl name={item.name} onRevoke={onRevoke} />
                )}
            </Td>
        </Tr>
    );
}

function RevokedNote({ revokedAt, now, focus }: { revokedAt: number; now: number; focus: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (focus) ref.current?.focus();
    }, [focus]);
    return (
        <span ref={ref} tabIndex={-1} title={formatLongDate(revokedAt)} className="block outline-0">
            <StatusValue tone="off">Revoked</StatusValue>
            <span className="block truncate pl-[14px] text-[11px] text-ink-note">
                {now - revokedAt < MINUTE ? (
                    "Just now"
                ) : (
                    <>
                        <span className="mono">{formatAge(revokedAt, now)}</span> ago
                    </>
                )}
            </span>
        </span>
    );
}

// Revoke asks once inline, in place of the button, and stays busy while the server works
function RevokeControl({ name, onRevoke }: { name: string; onRevoke: () => Promise<boolean> }) {
    const [confirming, setConfirming] = useState(false);
    const [busy, startTransition] = useTransition();
    const confirmRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLButtonElement>(null);
    const returnFocus = useRef(false);

    useEffect(() => {
        if (confirming) confirmRef.current?.focus();
        else if (returnFocus.current) {
            returnFocus.current = false;
            openerRef.current?.focus();
        }
    }, [confirming]);

    function cancel() {
        returnFocus.current = true;
        setConfirming(false);
    }

    function confirm() {
        startTransition(async () => {
            // On success the refreshed list shows the key as revoked
            if (!(await onRevoke())) cancel();
        });
    }

    if (!confirming) {
        return (
            <Hint content="Agents using this key are refused within seconds.">
                <Button ref={openerRef} size="sm" onClick={() => setConfirming(true)} aria-label={`Revoke key ${name}`}>
                    Revoke
                </Button>
            </Hint>
        );
    }

    return (
        <span
            role="group"
            aria-label={`Revoke key ${name}`}
            className="inline-flex items-center justify-end gap-2"
            onKeyDown={(event) => {
                if (event.key === "Escape" && !busy) cancel();
            }}
        >
            {busy ? null : (
                <Button variant="link" size="sm" onClick={cancel}>
                    Cancel
                </Button>
            )}
            <Button
                ref={confirmRef}
                variant="destructive"
                size="sm"
                busy={busy}
                onClick={confirm}
                aria-label={busy ? undefined : `Confirm revoking ${name}`}
            >
                {busy ? "Revoking…" : "Revoke"}
            </Button>
        </span>
    );
}
