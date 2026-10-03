import { Tr } from "@/components/kit/data-table";
import { RowChevron } from "@/components/kit/links";
import type { Step } from "@/lib/data/runs/types";
import { cn } from "@/lib/utils";
import { contextStyle } from "../lib/context";
import { KIND_WORD, STATUS_WORD, decisionWord, formatOffset, formatStepDuration } from "../lib/words";

const COLUMNS = ["#", "Step", "Agent", "Kind", "At", "Took", "Context", "Decision"];

type StepTableProps = { steps: Step[]; startedAt: number; height: number; onOpen: (index: number) => void };

// The timeline's table view: every step in time order, each one opening the drawer.
export function StepTable({ steps, startedAt, height, onOpen }: StepTableProps) {
    return (
        <div className="table-scroll overflow-y-auto border-y border-line" style={{ maxHeight: height }}>
            <table className="w-full border-collapse text-left">
                <caption className="sr-only">Steps of this run in time order</caption>
                <thead className="sticky top-0 z-[1] bg-recess text-[11px] text-ink-muted">
                    <tr>
                        {COLUMNS.map((label, i) => (
                            <th
                                key={label}
                                scope="col"
                                className={cn(
                                    "h-[30px] px-3 font-normal whitespace-nowrap",
                                    i === 4 || i === 5 ? "text-right" : "",
                                )}
                            >
                                {label}
                            </th>
                        ))}
                        <th scope="col" className="w-8">
                            <span className="sr-only">Open</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="mono text-[12px]">
                    {steps.map((step, i) => (
                        <Tr key={step.id} interactive className="h-7 border-b border-line last:border-0">
                            <td className="px-3 text-ink-muted">{i + 1}</td>
                            <th scope="row" className="px-3 font-normal whitespace-nowrap">
                                <button
                                    type="button"
                                    onClick={() => onOpen(i)}
                                    className="text-left text-ink outline-none after:absolute after:inset-0 after:content-[''] group-hover/row:text-ink-bright focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-signal"
                                >
                                    {step.name}
                                </button>
                            </th>
                            <td className="px-3 whitespace-nowrap text-ink-2">{step.agent}</td>
                            <td className="px-3 font-sans whitespace-nowrap text-ink-2">{KIND_WORD[step.kind]}</td>
                            <td className="px-3 text-right whitespace-nowrap text-ink">
                                {formatOffset(step.startedAt - startedAt)}
                            </td>
                            <td className="px-3 text-right whitespace-nowrap text-ink">
                                {formatStepDuration(step.durationMs)}
                            </td>
                            <td className="px-3 font-sans whitespace-nowrap text-ink-2">
                                {contextStyle(step.context).word}
                            </td>
                            <td className="px-3 font-sans whitespace-nowrap text-ink-2">
                                {step.guard
                                    ? decisionWord(step.guard)
                                    : step.status !== "ok"
                                      ? STATUS_WORD[step.status]
                                      : "—"}
                            </td>
                            <td className="w-8 pr-2 text-right">
                                <RowChevron className="ml-0" />
                            </td>
                        </Tr>
                    ))}
                </tbody>
            </table>
            {steps.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-ink-muted">This run has no steps yet</p>
            ) : null}
        </div>
    );
}
