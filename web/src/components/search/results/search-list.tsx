import { LabelChip, RunStatusLabel } from "@/components/kit/labels";
import { RowChevron, RowLink, TextLink } from "@/components/kit/links";
import { formatClock, formatLongDate, formatShortDate, shortId } from "@/lib/format";
import type { SearchMatch } from "@/lib/data/search";
import type { RunGroup } from "../lib/group";
import { matchWord, plural, stepName } from "../lib/words";

// One match as a block that opens its step, keeping the value and label in view on a phone
function MatchItem({ match }: { match: SearchMatch }) {
    const step = stepName(match);
    return (
        <li className="group/row relative -mx-[10px] flex cursor-pointer items-center gap-2 border-b border-line px-[10px] py-[14px] hover:bg-nav-hover">
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <RowLink
                        href={`/runs/${match.runId}?step=${match.stepId}`}
                        aria-label={`${step} by ${match.agent}, step ${match.stepId}`}
                        className="mono truncate text-[14px] text-ink"
                    >
                        {step}
                    </RowLink>
                    <span className="mono shrink-0 text-[12px] text-ink-muted" title={formatLongDate(match.at)}>
                        {formatClock(match.at, true)}
                    </span>
                </div>
                <p className="mt-[2px] truncate text-[12px] text-ink-muted">
                    {match.agent} · <span className="mono">{match.field}</span> · {matchWord(match)}
                </p>
                <p className="mono mt-2 text-[13px] text-ink-soft wrap-anywhere">{match.value}</p>
                {match.label ? (
                    <div className="mt-2">
                        <LabelChip label={match.label} />
                    </div>
                ) : null}
            </div>
            <RowChevron className="ml-0" />
        </li>
    );
}

// The narrow-screen form of the results, grouped by run like the table
export function SearchList({ groups }: { groups: RunGroup[] }) {
    return (
        <div className="border-t border-line">
            {groups.map(({ runId, run, matches }) => (
                <section key={runId} aria-label={`Run ${shortId(runId)}`}>
                    <header className="flex flex-wrap items-center gap-x-[14px] gap-y-1 border-b border-line bg-panel px-[10px] py-[11px] text-[12px] text-ink-muted">
                        <TextLink mono href={`/runs/${runId}`} className="text-[13px]">
                            Run {shortId(runId)}
                        </TextLink>
                        <RunStatusLabel status={run.status} />
                        <span className="ml-auto">
                            <span className="mono text-ink-2">{matches.length}</span>{" "}
                            {plural(matches.length, "match", "matches")}
                        </span>
                        <span className="basis-full">
                            Started by <span className="text-ink-2">{run.rootAgent}</span>
                            <span className="mono">
                                {" "}
                                · {formatShortDate(run.startedAt)}, {formatClock(run.startedAt)}
                            </span>
                        </span>
                    </header>
                    <ul className="px-[10px]">
                        {matches.map((match) => (
                            <MatchItem key={`${match.stepId}:${match.field}:${match.value}`} match={match} />
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
