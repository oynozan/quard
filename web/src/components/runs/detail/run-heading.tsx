import Link from "next/link";
import { Glyph } from "@/components/icons/glyphs";
import { RunStatusLabel } from "@/components/kit/labels";
import { TextLink } from "@/components/kit/links";
import { buttonVariants } from "@/components/ui/button";
import type { RunRow } from "@/lib/data/runs/types";
import { formatDuration, formatLongDate, shortId } from "@/lib/format";
import { CopyRunId } from "./copy-run-id";

type RunHeadingProps = { run: RunRow; open: boolean; showApproval: boolean };

// Breadcrumb, the run id as the title, its status and links to what points at it.
export function RunHeading({ run, open, showApproval }: RunHeadingProps) {
    const approvalId = showApproval ? run.approvalId : null;
    return (
        <header className="mb-[26px]">
            <nav aria-label="Breadcrumb" className="mb-[14px] flex items-center gap-[6px] text-[12px] text-ink-muted">
                <TextLink href="/runs">Runs</TextLink>
                <Glyph name="chevronRight" size={12} className="opacity-60" />
                <span aria-current="page" className="mono">
                    {shortId(run.id)}
                </span>
            </nav>
            <div className="flex items-start justify-between gap-6 max-[760px]:flex-col max-[760px]:gap-[14px]">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px] max-[760px]:text-[25px]">
                            Run <span className="mono text-[24px] tracking-normal">{shortId(run.id)}</span>
                        </h1>
                        <RunStatusLabel status={run.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-light text-ink-muted">
                        <CopyRunId id={run.id} />
                        <span>
                            Started <span className="mono text-ink-2">{formatLongDate(run.startedAt)}</span> UTC
                        </span>
                        <span>
                            {open ? "Running for" : "Took"}{" "}
                            <span className="mono text-ink-2">{formatDuration(run.durationMs)}</span>
                        </span>
                    </div>
                </div>
                {approvalId || run.incidentId ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {approvalId ? (
                            <Link
                                href={`/approvals#${approvalId}`}
                                className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                                Open approval
                            </Link>
                        ) : null}
                        {run.incidentId ? (
                            <Link
                                href={`/incidents/${run.incidentId}`}
                                className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                                Open incident
                            </Link>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
