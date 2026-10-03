"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NameCell, Td, Tr } from "@/components/kit/data-table";
import { Absent, StatusValue } from "@/components/kit/detail/detail-list";
import { Badge } from "@/components/kit/labels";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import type { AgentKey } from "@/lib/data/settings";
import { formatAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pause } from "../lib/new-key";
import { Ago, FIRST_CELL, Quiet, ShortDate } from "../shared/table-parts";

type Phase = "idle" | "confirm" | "busy";

type KeyRowProps = {
    item: AgentKey;
    now: number;
    // The key that was just created or revoked, so its row can take focus
    fresh: boolean;
    onRevoke: (id: string) => void;
};

export function KeyRow({ item, now, fresh, onRevoke }: KeyRowProps) {
    const revoked = item.revokedAt !== null;
    return (
        <Tr className={cn(revoked && "text-ink-muted")}>
            <Td colSpan={2} className={FIRST_CELL}>
                <NameCell
                    icon={<KeyRound size={20} strokeWidth={0.75} className="opacity-80" />}
                    name={<span className={cn(revoked && "text-ink-muted")}>{item.name}</span>}
                    sub={<span className="mono text-[12px]">{item.prefix}</span>}
                />
            </Td>
            <Td>
                <span className="flex min-w-0 items-center gap-2">
                    <Badge>{item.scope === "app" ? "App" : "Agent"}</Badge>
                    <Quiet mono title={item.agents.join(", ")}>
                        {item.agents.join(", ")}
                    </Quiet>
                </span>
            </Td>
            <Td>
                <Quiet mono title={item.createdBy}>
                    {item.createdBy}
                </Quiet>
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
                {revoked ? (
                    <RevokedNote item={item} now={now} focus={fresh} />
                ) : (
                    <StatusValue tone="on">Active</StatusValue>
                )}
            </Td>
            <Td className="pr-[10px]">
                {revoked ? (
                    <span className="sr-only">No actions</span>
                ) : (
                    <RevokeControl name={item.name} onRevoke={() => onRevoke(item.id)} />
                )}
            </Td>
        </Tr>
    );
}

function RevokedNote({ item, now, focus }: { item: AgentKey; now: number; focus: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (focus) ref.current?.focus();
    }, [focus]);
    const by = item.revokedBy ?? "an admin";
    return (
        <span ref={ref} tabIndex={-1} title={`Revoked by ${by}`} className="block outline-0">
            <StatusValue tone="off">Revoked</StatusValue>
            <span className="block truncate pl-[14px] text-[11px] text-ink-note">
                {item.revokedAt !== null && now - item.revokedAt < 60_000 ? (
                    "Just now"
                ) : (
                    <>
                        <span className="mono">{item.revokedAt ? formatAge(item.revokedAt, now) : "—"}</span> ago
                    </>
                )}
            </span>
        </span>
    );
}

// Revoke asks once inline, in place of the button, before it runs
function RevokeControl({ name, onRevoke }: { name: string; onRevoke: () => void }) {
    const [phase, setPhase] = useState<Phase>("idle");
    const confirmRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLButtonElement>(null);
    const returnFocus = useRef(false);

    useEffect(() => {
        if (phase === "confirm") confirmRef.current?.focus();
        if (phase === "idle" && returnFocus.current) {
            returnFocus.current = false;
            openerRef.current?.focus();
        }
    }, [phase]);

    function cancel() {
        returnFocus.current = true;
        setPhase("idle");
    }

    async function confirm() {
        setPhase("busy");
        await pause(650);
        onRevoke();
    }

    if (phase === "idle") {
        return (
            <Hint content="Agents using this key are refused within seconds.">
                <Button ref={openerRef} size="sm" onClick={() => setPhase("confirm")} aria-label={`Revoke key ${name}`}>
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
                if (event.key === "Escape" && phase === "confirm") cancel();
            }}
        >
            {phase === "confirm" ? (
                <Button variant="link" size="sm" onClick={cancel}>
                    Cancel
                </Button>
            ) : null}
            <Button
                ref={confirmRef}
                variant="destructive"
                size="sm"
                busy={phase === "busy"}
                onClick={confirm}
                aria-label={phase === "busy" ? undefined : `Confirm revoking ${name}`}
            >
                {phase === "busy" ? "Revoking…" : "Revoke"}
            </Button>
        </span>
    );
}
