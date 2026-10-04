"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useRef, useState } from "react";
import { SectionHeading } from "@/components/kit/headings";
import { TableState } from "@/components/kit/data-table";
import { showToast } from "@/components/ui/toast";
import { answerApproval, revokeAlwaysGrant } from "@/lib/data/approvals/actions";
import type { AlwaysGrant, ApprovalAnswer, ApprovalDetail, ApprovalsData } from "@/lib/data/approvals/types";
import { DecisionsTable } from "./decisions-table";
import { GrantsTable } from "./grants-table";
import { applyChange, boardOf } from "./lib/board";
import { ANSWER_CODE, answerMessage } from "./lib/model";
import { SHOWN_STEP } from "./lib/shown";
import { MoreRequests } from "./more-requests";
import { RequestCard } from "./request-card";

// `shown` is how many open requests the address asks for, and `linked` one request it asks to list
type Props = { data: ApprovalsData; now: number; approver: string; shown?: number; linked?: string };

// Open requests, standing grants and past answers. An answer shows at once and
// is saved in the background; if saving fails, the request comes back.
export function ApprovalsBoard({ data, now, approver, shown = SHOWN_STEP, linked }: Props) {
    const router = useRouter();
    const [view, change] = useOptimistic(boardOf(data), applyChange);
    const [announce, setAnnounce] = useState("");
    const cards = useRef(new Map<string, HTMLElement>());
    const heading = useRef<HTMLDivElement>(null);
    // Every open request, listed here or not, like the sidebar count
    const waiting = view.open.length + view.more;
    // The server lists every live request even past `shown`, so the next step starts after its list
    const listed = Math.max(shown, data.open.length);

    function tell(message: string, id: string) {
        showToast(message, id);
        setAnnounce(message);
    }

    function decide(item: ApprovalDetail, answer: ApprovalAnswer) {
        const { id, tool } = item.request;
        const index = view.open.findIndex((entry) => entry.request.id === id);
        const rest = view.open.filter((entry) => entry.request.id !== id);
        if (window.location.hash === `#${id}`) {
            history.replaceState(null, "", window.location.pathname);
        }
        startTransition(async () => {
            change({ kind: "answer", item, answer, at: Date.now(), by: approver });
            // Keep focus in the list: the next card, or the heading when none is left.
            const next = rest[Math.min(index, rest.length - 1)];
            window.requestAnimationFrame(() => {
                const target = next ? cards.current.get(next.request.id) : heading.current;
                target?.focus();
            });
            try {
                const result = await answerApproval(id, ANSWER_CODE[answer]);
                if (result === "decided") {
                    const message = answerMessage(answer, tool);
                    showToast(message, "approval-answer");
                    setAnnounce(`${message}. ${rest.length + view.more} still open.`);
                    return;
                }
                tell(
                    result === "already_decided" ? `Someone already answered ${tool}` : `${tool} is no longer open`,
                    "approval-answer",
                );
                router.refresh();
            } catch {
                tell(`Could not save the answer for ${tool}. It is still open`, "approval-answer");
            }
        });
    }

    function revoke(grant: AlwaysGrant) {
        startTransition(async () => {
            change({ kind: "revoke", grant, at: Date.now(), by: approver });
            try {
                if (await revokeAlwaysGrant(grant.id)) {
                    tell(`Revoked always approve for ${grant.tool}. Later calls ask again`, "grant-revoke");
                    return;
                }
                tell(`Always approve for ${grant.tool} was already revoked`, "grant-revoke");
                router.refresh();
            } catch {
                tell(`Could not revoke always approve for ${grant.tool}`, "grant-revoke");
            }
        });
    }

    return (
        <>
            <p role="status" aria-live="polite" className="sr-only">
                {announce}
            </p>

            <section aria-label="Waiting for an answer" className="min-w-0">
                <div ref={heading} tabIndex={-1} className="outline-none">
                    <SectionHeading title="Waiting for an answer" count={waiting} />
                </div>
                {view.open.length > 0 ? (
                    <div className="grid gap-6">
                        {view.open.map((item) => (
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
                ) : waiting === 0 ? (
                    <div className="border-y border-line">
                        <TableState
                            title="Nothing waits for an answer"
                            body="Calls a guard sends to a human pause here."
                        />
                    </div>
                ) : null}
                {view.more > 0 ? (
                    <div className="mt-6">
                        <MoreRequests more={view.more} shown={listed} linked={linked} />
                    </div>
                ) : null}
            </section>

            <GrantsTable grants={view.grants} now={now} onRevoke={revoke} />
            <DecisionsTable decisions={view.decisions} now={now} fresh={new Set(view.fresh)} />
        </>
    );
}
