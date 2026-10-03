"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AlwaysGrant } from "@/lib/data/approvals/types";
import { formatAge } from "@/lib/format";

type Props = { grant: AlwaysGrant; now: number; onRevoke(grant: AlwaysGrant): void };

// Revoke with an inline confirm. A revoked grant shows who ended it.
export function RevokeCell({ grant, now, onRevoke }: Props) {
    const [confirming, setConfirming] = useState(false);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const revokeRef = useRef<HTMLButtonElement>(null);
    const touched = useRef(false);

    useEffect(() => {
        if (confirming) confirmRef.current?.focus();
        else if (touched.current) revokeRef.current?.focus();
        touched.current = touched.current || confirming;
    }, [confirming]);

    if (grant.revokedAt !== null) {
        return (
            <span className="block text-[12px] text-ink-absent" title={`Revoked by ${grant.revokedBy ?? "unknown"}`}>
                Revoked <span className="mono">{formatAge(grant.revokedAt, now)}</span> ago
                <span className="block truncate text-[11px]">{grant.revokedBy}</span>
            </span>
        );
    }
    if (confirming) {
        return (
            <span className="relative z-[1] inline-flex items-center gap-1">
                <Button
                    ref={confirmRef}
                    size="sm"
                    variant="destructive"
                    aria-label={`Confirm revoke ${grant.id}`}
                    onClick={() => onRevoke(grant)}
                >
                    Revoke
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep
                </Button>
            </span>
        );
    }
    return (
        <Button
            ref={revokeRef}
            size="sm"
            className="relative z-[1]"
            aria-label={`Revoke ${grant.id}`}
            onClick={() => setConfirming(true)}
        >
            Revoke
        </Button>
    );
}
