import { ListTree } from "lucide-react";
import { OutcomeBar } from "@/components/charts/outcome-bar";
import { DataTable, NameCell, Td, Tr } from "@/components/kit/data-table";
import { RunStatusLabel } from "@/components/kit/labels";
import { RowChevron, RowLink } from "@/components/kit/links";
import { formatAge, formatCost, formatDuration, formatInt, shortId } from "@/lib/format";
import type { RunRow } from "@/lib/data/runs/types";
import { RUNS_MIN_WIDTH, RunsColgroup, RunsHead } from "./runs-columns";
import { costText } from "../detail/lib/cost";

// A number in mono followed by its unit word, like "12 min".
function Amount({ value, unit }: { value: string | number; unit: string }) {
    return (
        <>
            <span className="mono">{value}</span> {unit}
        </>
    );
}

function RunRowView({ run, now }: { run: RunRow; now: number }) {
    const label = `Run ${shortId(run.id)} by ${run.rootAgent}`;
    const decided = run.decisions.allowed + run.decisions.asked + run.decisions.blocked;
    const [age, ageUnit] = formatAge(run.startedAt, now).split(" ");
    return (
        <Tr interactive>
            <Td colSpan={2} className="pl-[54px] max-[760px]:pl-[10px]">
                <RowLink href={`/runs/${run.id}`} aria-label={label}>
                    <NameCell
                        icon={<ListTree size={20} strokeWidth={0.75} className="opacity-80" />}
                        name={run.rootAgent}
                        sub={
                            <>
                                <span className="mono text-[12px]">{shortId(run.id)}</span> ·{" "}
                                <Amount value={run.agents.length} unit={run.agents.length === 1 ? "agent" : "agents"} />{" "}
                                · <Amount value={formatInt(run.steps)} unit={run.steps === 1 ? "step" : "steps"} />
                            </>
                        }
                    />
                </RowLink>
            </Td>
            <Td>
                <RunStatusLabel status={run.status} />
            </Td>
            <Td>
                {decided > 0 ? (
                    <OutcomeBar counts={run.decisions} />
                ) : (
                    <span className="text-[12px] text-ink-absent">None yet</span>
                )}
            </Td>
            <Td className="mono text-[12px] text-ink-2">{costText(run.costUsd, run.costKnown, formatCost)}</Td>
            <Td className="mono text-[12px] text-ink-2">{formatDuration(run.durationMs)}</Td>
            <Td className="text-[12px] text-ink-2">
                <time dateTime={new Date(run.startedAt).toISOString()}>
                    <Amount value={age} unit={`${ageUnit} ago`} />
                </time>
                <RowChevron />
            </Td>
        </Tr>
    );
}

// The full runs table. Each whole row opens its run.
export function RunsTable({ runs, now }: { runs: RunRow[]; now: number }) {
    return (
        <DataTable minWidth={RUNS_MIN_WIDTH} className="text-[14px]">
            <caption className="sr-only">Runs, newest first</caption>
            <RunsColgroup />
            <RunsHead />
            <tbody>
                {runs.map((run) => (
                    <RunRowView key={run.id} run={run} now={now} />
                ))}
            </tbody>
        </DataTable>
    );
}
