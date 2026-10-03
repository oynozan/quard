"use client";

import { ChartPane } from "@/components/charts/chart-pane";
import { ChartTable } from "@/components/charts/chart-table";
import { EmptyLine } from "@/components/kit/empty";
import { Pane } from "@/components/kit/pane";
import type { AgentCall } from "@/lib/data/agents";
import { formatClock, formatInt, formatStepDuration, shortId } from "@/lib/format";
import { CONTEXTS, contextStyle } from "@/components/runs/detail/lib/context";
import { plural } from "../lib/words";
import { CallField } from "./call-field";
import { KIND_WORD, markColor, markOf, MARK_WORD, outcomeWord, type MarkKind } from "./lanes";

function Swatch({ fill, hole }: { fill: string; hole: boolean }) {
    return (
        <svg aria-hidden width={10} height={10} shapeRendering="crispEdges" className="shrink-0">
            <rect width={10} height={10} fill={fill} />
            {hole ? <rect x={4} y={4} width={2} height={2} fill="var(--page)" /> : null}
        </svg>
    );
}

function MarkSwatch({ kind }: { kind: MarkKind }) {
    const color = markColor(kind);
    return (
        <svg aria-hidden width={10} height={5} shapeRendering="crispEdges" className="shrink-0">
            {kind.startsWith("would") ? (
                <rect x={0.5} y={0.5} width={9} height={4} fill="none" stroke={color} />
            ) : (
                <rect width={10} height={5} fill={color} />
            )}
        </svg>
    );
}

function Legend({ calls }: { calls: AgentCall[] }) {
    const marks = (["block", "ask", "would-block", "would-ask"] as MarkKind[]).filter((kind) =>
        calls.some((call) => markOf(call) === kind),
    );
    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-line pt-3 text-[11px] font-light text-ink-muted">
            <span className="sr-only">Legend:</span>
            {CONTEXTS.map((context) => (
                <span key={context.key} className="inline-flex items-center gap-[7px]">
                    <Swatch fill={context.fill} hole={context.untrusted} />
                    {context.word}
                </span>
            ))}
            {marks.length ? <span aria-hidden className="h-3 w-px bg-line" /> : null}
            {marks.map((kind) => (
                <span key={kind} className="inline-flex items-center gap-[7px]">
                    <MarkSwatch kind={kind} />
                    {MARK_WORD[kind]}
                </span>
            ))}
        </div>
    );
}

function summaryOf(name: string, calls: AgentCall[]): string {
    const untrusted = calls.filter((call) => call.context.trust === "untrusted").length;
    const stopped = calls.filter((call) => markOf(call) === "block").length;
    const oldest = calls[calls.length - 1];
    return (
        `The last ${calls.length} ${plural(calls.length, "call")} by ${name}, from ${formatClock(oldest.at, true)} ` +
        `to ${formatClock(calls[0].at, true)} UTC. ${untrusted} ran with untrusted content in context, ` +
        `and guards blocked ${stopped}.`
    );
}

// The agent's newest calls as label-colored cells, with every call listed behind the Table toggle
export function CallTimeline({ name, calls }: { name: string; calls: AgentCall[] }) {
    if (calls.length === 0) {
        return (
            <Pane title="Recent calls">
                <EmptyLine inset>No calls yet</EmptyLine>
            </Pane>
        );
    }
    const count = (kind: MarkKind) => calls.filter((call) => markOf(call) === kind).length;
    const untrusted = calls.filter((call) => call.context.trust === "untrusted").length;

    const table = (
        <ChartTable
            caption={`The last ${calls.length} calls by ${name}, newest first`}
            height={260}
            columns={[
                { label: "Time (UTC)", align: "left" },
                { label: "Kind", align: "left" },
                { label: "Name", align: "left" },
                { label: "Context", align: "left" },
                { label: "Guard", align: "left" },
                { label: "Took" },
                { label: "Run" },
            ]}
            rows={calls.map((call) => ({
                // Step ids are unique only within a run
                key: `${call.runId}/${call.stepId}`,
                cells: [
                    formatClock(call.at, true),
                    KIND_WORD[call.kind],
                    call.name,
                    `${contextStyle(call.context).word} · ${call.context.origin}`,
                    outcomeWord(call),
                    formatStepDuration(call.durationMs),
                    shortId(call.runId),
                ],
            }))}
        />
    );

    return (
        <ChartPane
            title="Recent calls"
            tag={`LAST ${calls.length}`}
            readouts={[
                { label: "Untrusted context", value: formatInt(untrusted) },
                { label: "Asked", value: formatInt(count("ask")) },
                { label: "Blocked", value: formatInt(count("block")) },
            ]}
            table={table}
        >
            <CallField calls={calls} summary={summaryOf(name, calls)} />
            <Legend calls={calls} />
        </ChartPane>
    );
}
