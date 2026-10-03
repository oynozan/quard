"use client";

import { forwardRef } from "react";
import { SubHeading } from "@/components/kit/headings";
import { TextLink } from "@/components/kit/links";
import type { ApprovalAnswer, ApprovalDetail } from "@/lib/data/approvals/types";
import { formatClock, shortId } from "@/lib/format";
import { ArgumentList } from "./argument-list";
import { GuardChecks } from "./guard-checks";
import { RequestStatus } from "./heartbeat";
import { InfluencePath } from "./influence-path";
import { RequestActions } from "./request-actions";

type Props = { item: ApprovalDetail; now: number; onAnswer(item: ApprovalDetail, answer: ApprovalAnswer): void };

// One open request: what will run, where each value came from, and the three answers.
export const RequestCard = forwardRef<HTMLElement, Props>(function RequestCard({ item, now, onAnswer }, ref) {
    const { request, heartbeat } = item;
    const live = heartbeat.state === "live";
    const titleId = `${request.id}-title`;
    return (
        <article
            ref={ref}
            id={request.id}
            tabIndex={-1}
            aria-labelledby={titleId}
            className="scroll-mt-6 rounded-md bg-panel target:bg-surface"
        >
            <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-10 px-[18px] pt-[18px] max-[1180px]:grid-cols-1 max-[760px]:px-[14px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 id={titleId} className="mono text-[17px] leading-[1.3] text-ink-bright wrap-anywhere">
                            {request.tool}
                        </h3>
                        <RequestStatus heartbeat={heartbeat} openedAt={request.openedAt} now={now} />
                    </div>
                    <p className="mt-[6px] text-[12px] leading-[1.7] text-ink-muted">
                        <span className="mono text-ink-2">{request.agent}</span>
                        {" · run "}
                        <TextLink mono href={`/runs/${request.runId}`} aria-label={`Open run ${request.runId}`}>
                            {shortId(request.runId)}
                        </TextLink>
                        {" · asked "}
                        <span className="mono text-ink-2">{formatClock(request.openedAt)}</span> UTC
                        <span className="mono text-ink-faint">{` · ${request.id}`}</span>
                    </p>
                    <p className="mt-3 text-[13px] leading-[1.6] text-ink-soft">{request.reason}</p>

                    <div className="mt-6">
                        <SubHeading>Arguments</SubHeading>
                        <ArgumentList args={item.args} />
                    </div>

                    {item.decisions.length > 0 ? (
                        <div className="mt-6">
                            <SubHeading>Checks</SubHeading>
                            <GuardChecks decisions={item.decisions} shown={request.reason} />
                        </div>
                    ) : null}

                    {item.joined.length > 0 ? (
                        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
                            <span>
                                Also covers {item.joined.length} identical {item.joined.length === 1 ? "call" : "calls"}
                            </span>
                            {item.joined.map((call) => (
                                <TextLink
                                    key={`${call.runId}-${call.stepId}`}
                                    mono
                                    href={`/runs/${call.runId}`}
                                    aria-label={`Open run ${call.runId}`}
                                >
                                    {shortId(call.runId)}
                                </TextLink>
                            ))}
                        </p>
                    ) : null}
                </div>

                <div className="min-w-0 max-[1180px]:mt-6">
                    <SubHeading>Influence path</SubHeading>
                    {item.path.length > 0 ? (
                        <InfluencePath nodes={item.path} waiting={live} pathId={`${request.id}-path`} />
                    ) : (
                        <p className="text-[12px] leading-[1.7] text-ink-muted">The run has not arrived yet.</p>
                    )}
                </div>
            </div>

            <footer className="px-[18px] pt-6 pb-[18px] max-[760px]:px-[14px]">
                <RequestActions
                    agent={request.agent}
                    tool={request.tool}
                    live={live}
                    onAnswer={(answer) => onAnswer(item, answer)}
                />
            </footer>
        </article>
    );
});
