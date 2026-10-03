"use client";

import { useRef, useState } from "react";
import { SectionHeading } from "@/components/kit/headings";
import { TableState } from "@/components/kit/data-table";
import { showToast } from "@/components/ui/toast";
import type { AlwaysGrant, ApprovalAnswer, ApprovalDetail, ApprovalsData } from "@/lib/data/approvals/types";
import { DecisionsTable } from "./decisions-table";
import { GrantsTable } from "./grants-table";
import { answerMessage, CURRENT_USER, decisionOf, grantOf, orderOpen } from "./lib/model";
import { RequestCard } from "./request-card";

type Props = { data: ApprovalsData; now: number };

// Open requests, standing grants and past answers. Answers live in local state until there is a backend.
export function ApprovalsBoard({ data, now }: Props) {
    const [open, setOpen] = useState(() => orderOpen(data.open));
    const [grants, setGrants] = useState(data.grants);
    const [decisions, setDecisions] = useState(data.decisions);
    const [fresh, setFresh] = useState<Set<string>>(() => new Set());
    const [announce, setAnnounce] = useState("");
    const cards = useRef(new Map<string, HTMLElement>());
    const heading = useRef<HTMLDivElement>(null);

    function decide(item: ApprovalDetail, answer: ApprovalAnswer) {
        const index = open.findIndex((entry) => entry.request.id === item.request.id);
        const rest = open.filter((entry) => entry.request.id !== item.request.id);
        setOpen(rest);
        setDecisions((list) => [decisionOf(item, answer, now), ...list]);
        setFresh((set) => new Set(set).add(item.request.id));
        if (answer === "always approve") setGrants((list) => [grantOf(item, now), ...list]);
        const message = answerMessage(answer, item.request.tool);
        showToast(message, "approval-answer");
        setAnnounce(`${message}. ${rest.length} still open.`);
        if (window.location.hash === `#${item.request.id}`) {
            history.replaceState(null, "", window.location.pathname);
        }
        // Keep focus in the list: the next card, or the heading when none is left.
        const next = rest[Math.min(index, rest.length - 1)];
        window.requestAnimationFrame(() => {
            const target = next ? cards.current.get(next.request.id) : heading.current;
            target?.focus();
        });
    }

    function revoke(grant: AlwaysGrant) {
        setGrants((list) =>
            list.map((entry) =>
                entry.id === grant.id ? { ...entry, revokedAt: now, revokedBy: CURRENT_USER } : entry,
            ),
        );
        const message = `Revoked always approve for ${grant.tool}. Later calls ask again`;
        showToast(message, "grant-revoke");
        setAnnounce(message);
    }

    return (
        <>
            <p role="status" aria-live="polite" className="sr-only">
                {announce}
            </p>

            <section aria-label="Waiting for an answer" className="min-w-0">
                <div ref={heading} tabIndex={-1} className="outline-none">
                    <SectionHeading title="Waiting for an answer" count={open.length} />
                </div>
                {open.length > 0 ? (
                    <div className="grid gap-6">
                        {open.map((item) => (
                            <RequestCard
                                key={item.request.id}
                                ref={(node) => {
                                    if (node) cards.current.set(item.request.id, node);
                                    else cards.current.delete(item.request.id);
                                }}
                                item={item}
                                now={now}
                                onAnswer={decide}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="border-y border-line">
                        <TableState
                            title="Nothing waits for an answer"
                            body="Calls a guard sends to a human pause here."
                        />
                    </div>
                )}
            </section>

            <GrantsTable grants={grants} now={now} onRevoke={revoke} />
            <DecisionsTable decisions={decisions} now={now} fresh={fresh} />
        </>
    );
}
