"use client";

import { Absent, DetailList, DetailRow, StatusValue } from "@/components/kit/detail/detail-list";
import { DrawerSection, IdentifierRow } from "@/components/kit/detail/drawer-parts";
import { LabelChip } from "@/components/kit/labels";
import { ArrowLink } from "@/components/kit/links";
import { Drawer } from "@/components/ui/drawer";
import type { Step } from "@/lib/data/runs/types";
import { formatClock, formatInt } from "@/lib/format";
import { contextStyle } from "../lib/context";
import { KIND_WORD, STATUS_TONE, STATUS_WORD, formatOffset, formatStepDuration } from "../lib/words";
import { GuardDetails } from "./guard-details";
import { ValueOrigins } from "./value-origins";

type StepDrawerProps = {
    step: Step | null;
    startedAt: number;
    onClose: () => void;
};

function usd(value: number): string {
    return `$${value.toFixed(4)}`;
}

// Everything about one step: timing, cost, context, value labels and the guard decision.
export function StepDrawer({ step, startedAt, onClose }: StepDrawerProps) {
    return (
        <Drawer
            open={step !== null}
            onOpenChange={(open) => (open ? undefined : onClose())}
            title={step?.name ?? ""}
            view={step?.id}
        >
            {step ? <StepBody step={step} startedAt={startedAt} /> : null}
        </Drawer>
    );
}

function StepBody({ step, startedAt }: { step: Step; startedAt: number }) {
    const context = contextStyle(step.context);
    return (
        <>
            <IdentifierRow value={step.id} />
            <p className="mt-4 text-[13px] leading-[1.7] text-ink-note">{step.detail}</p>

            <DrawerSection>
                <DetailList>
                    <DetailRow term="Kind">{KIND_WORD[step.kind]}</DetailRow>
                    <DetailRow term="Agent" mono>
                        {step.agent}
                    </DetailRow>
                    <DetailRow term="Status">
                        <StatusValue tone={STATUS_TONE[step.status]}>{STATUS_WORD[step.status]}</StatusValue>
                    </DetailRow>
                    <DetailRow term="Started" mono>
                        {formatClock(step.startedAt, true)} · +{formatOffset(step.startedAt - startedAt)}
                    </DetailRow>
                    <DetailRow term="Took" mono>
                        {step.status === "waiting"
                            ? `${formatStepDuration(step.durationMs)} so far`
                            : formatStepDuration(step.durationMs)}
                    </DetailRow>
                    <DetailRow term="Context">
                        <span className="inline-flex flex-col items-end gap-[6px]">
                            <LabelChip label={step.context} />
                            <span className="text-[12px] text-ink-muted">{context.word}</span>
                        </span>
                    </DetailRow>
                    {step.parentId ? (
                        <DetailRow term="Parent step" mono>
                            {step.parentId}
                        </DetailRow>
                    ) : null}
                    {step.hosted ? <DetailRow term="Hosted">Yes</DetailRow> : null}
                </DetailList>
            </DrawerSection>

            {step.error ? (
                <DrawerSection title="Error">
                    <p className="mono text-[12px] leading-[1.7] text-ink-alert wrap-anywhere">{step.error}</p>
                </DrawerSection>
            ) : null}

            {step.guard ? (
                <DrawerSection title="Guard decision">
                    <GuardDetails guard={step.guard} />
                </DrawerSection>
            ) : null}

            {step.args.length || step.kind === "tool_call" ? (
                <DrawerSection title="Arguments">
                    <ValueOrigins args={step.args} startedAt={startedAt} />
                </DrawerSection>
            ) : null}

            {step.model ? (
                <DrawerSection title="Model">
                    <DetailList>
                        <DetailRow term="Model" mono>
                            {step.model.model}
                        </DetailRow>
                        <DetailRow term="Input tokens" mono>
                            {formatInt(step.model.inputTokens)}
                        </DetailRow>
                        <DetailRow term="Cached tokens" mono>
                            {formatInt(step.model.cachedTokens)}
                        </DetailRow>
                        <DetailRow term="Output tokens" mono>
                            {formatInt(step.model.outputTokens)}
                        </DetailRow>
                        <DetailRow term="Cost" mono>
                            {step.model.costKnown === false ? (
                                <Absent>No price for this model</Absent>
                            ) : (
                                usd(step.model.costUsd)
                            )}
                        </DetailRow>
                        <DetailRow term="Asked for" mono>
                            {step.model.toolCalls.length ? step.model.toolCalls.join(", ") : <Absent>No tools</Absent>}
                        </DetailRow>
                    </DetailList>
                </DrawerSection>
            ) : null}

            {step.output ? (
                <DrawerSection title="Output">
                    <LabelChip label={step.output.label} />
                    <p className="mt-3 text-[13px] leading-[1.7] text-ink-soft">{step.output.summary}</p>
                </DrawerSection>
            ) : null}

            {step.link ? (
                <DrawerSection title="Message between agents">
                    <DetailList>
                        <DetailRow term="Kind">{step.link.kind[0].toUpperCase() + step.link.kind.slice(1)}</DetailRow>
                        <DetailRow term="From" mono>
                            {step.link.from}
                        </DetailRow>
                        <DetailRow term="To" mono>
                            {step.link.to}
                        </DetailRow>
                        <DetailRow term="Channel" mono>
                            {step.link.channel}
                        </DetailRow>
                        <DetailRow term="Label reference" mono>
                            {step.link.labelRef}
                        </DetailRow>
                    </DetailList>
                    {step.link.carries.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {step.link.carries.map((label) => (
                                <LabelChip key={label.origin} label={label} />
                            ))}
                        </div>
                    ) : null}
                    <p className="mt-3 text-[13px] leading-[1.7] text-ink-soft">{step.link.summary}</p>
                </DrawerSection>
            ) : null}

            {step.memory ? (
                <DrawerSection title="Memory">
                    <DetailList>
                        <DetailRow term="Store" mono>
                            {step.memory.store}
                        </DetailRow>
                        <DetailRow term="Key" mono>
                            {step.memory.key}
                        </DetailRow>
                        <DetailRow term="Label">
                            <LabelChip label={step.memory.label} />
                        </DetailRow>
                        <DetailRow term="Hash check">
                            {step.memory.hashOk ? "Passed" : "Changed · read as untrusted"}
                        </DetailRow>
                    </DetailList>
                </DrawerSection>
            ) : null}

            {step.approval ? (
                <DrawerSection title="Approval">
                    <DetailList>
                        <DetailRow term="Request" mono>
                            {step.approval.requestId}
                        </DetailRow>
                        <DetailRow term="State">
                            <StatusValue tone={step.approval.state === "waiting" ? "warning" : "context"}>
                                {step.approval.state[0].toUpperCase() + step.approval.state.slice(1)}
                            </StatusValue>
                        </DetailRow>
                        <DetailRow term="Decided by">{step.approval.by ?? <Absent>Nobody yet</Absent>}</DetailRow>
                        <DetailRow term="Arguments hash" mono>
                            {step.approval.argsHash}
                        </DetailRow>
                    </DetailList>
                    {step.approval.state === "waiting" ? (
                        <ArrowLink href={`/approvals#${step.approval.requestId}`} className="mt-4">
                            Answer in Approvals
                        </ArrowLink>
                    ) : null}
                </DrawerSection>
            ) : null}
        </>
    );
}
