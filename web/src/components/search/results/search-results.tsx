import { DataTable, NameCell, Td, Tr } from "@/components/kit/data-table";
import { LabelChip, RunStatusLabel } from "@/components/kit/labels";
import { RowChevron, RowLink, TextLink } from "@/components/kit/links";
import { formatClock, formatLongDate, formatShortDate, shortId } from "@/lib/format";
import type { SearchMatch } from "@/lib/data/search";
import type { RunGroup } from "../lib/group";
import { matchWord, plural, stepName } from "../lib/words";
import { SEARCH_COLUMNS, SEARCH_MIN_WIDTH, SearchColgroup, SearchHead } from "./search-columns";

// The header row of one run's group: the run link, its status, starter and match count.
function RunGroupRow({ group }: { group: RunGroup }) {
    const { run, runId, matches } = group;
    const count = matches.length;
    return (
        <tr className="bg-panel">
            <td colSpan={SEARCH_COLUMNS} className="h-[50px] border-b border-line px-[10px] py-2">
                <div className="flex items-center gap-x-[18px] gap-y-1 pl-[44px] text-[12px] text-ink-muted">
                    <TextLink mono href={`/runs/${runId}`} className="text-[13px]">
                        Run {shortId(runId)}
                    </TextLink>
                    {run ? (
                        <>
                            <RunStatusLabel status={run.status} />
                            <span className="truncate">
                                Started by <span className="text-ink-2">{run.rootAgent}</span>
                                <span className="mono">
                                    {" "}
                                    · {formatShortDate(run.startedAt)}, {formatClock(run.startedAt)}
                                </span>
                            </span>
                        </>
                    ) : (
                        <span className="text-ink-absent">Run details expired</span>
                    )}
                    <span className="ml-auto shrink-0 pr-[2px]">
                        <span className="mono text-ink-2">{count}</span> {plural(count, "match", "matches")}
                    </span>
                </div>
            </td>
        </tr>
    );
}

function MatchRow({ match }: { match: SearchMatch }) {
    const step = stepName(match);
    return (
        <Tr interactive>
            <Td colSpan={2} className="pl-[10px]">
                <RowLink
                    href={`/runs/${match.runId}?step=${match.stepId}`}
                    aria-label={`${step} by ${match.agent}, step ${match.stepId}, in run ${shortId(match.runId)}`}
                    className="pl-[44px]"
                >
                    <NameCell mono name={step} />
                </RowLink>
            </Td>
            <Td className="truncate text-[12px] text-ink-2" title={match.agent}>
                {match.agent}
            </Td>
            <Td className="mono truncate text-[12px] text-ink-2" title={match.field}>
                {match.field}
            </Td>
            <Td>
                <span className="flex min-w-0 flex-col">
                    <span className="mono truncate text-[13px] text-ink-soft" title={match.value}>
                        {match.value}
                    </span>
                    <small className="truncate text-[11px] text-ink-note">{matchWord(match)}</small>
                </span>
            </Td>
            <Td className="truncate">
                <LabelChip label={match.label} />
            </Td>
            <Td className="mono text-[12px] whitespace-nowrap text-ink-2" title={formatLongDate(match.at)}>
                {formatClock(match.at, true)}
                <RowChevron />
            </Td>
        </Tr>
    );
}

// Every match, grouped by run with the newest run first.
export function SearchResults({ groups }: { groups: RunGroup[] }) {
    return (
        <DataTable minWidth={SEARCH_MIN_WIDTH} className="text-[14px]">
            <SearchColgroup />
            <SearchHead />
            {groups.map((group) => (
                <tbody key={group.runId} aria-label={`Run ${shortId(group.runId)}`}>
                    <RunGroupRow group={group} />
                    {group.matches.map((match) => (
                        <MatchRow key={`${match.stepId}:${match.field}:${match.value}`} match={match} />
                    ))}
                </tbody>
            ))}
        </DataTable>
    );
}
