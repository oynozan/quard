import { SectionHeading } from "@/components/kit/headings";
import { Badge } from "@/components/kit/labels";
import { TextLink } from "@/components/kit/links";
import { Absent, DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import type { Verdict } from "@/lib/data/incidents/types";
import { sentenceCase } from "../lib/labels";
import { Disclosure } from "./disclosure";

// A rule name stands alone; otherwise the first clause says what was missing.
function MissingGuard({ text }: { text: string }) {
    const [first, ...rest] = text.split(" ");
    const isRule = first.includes(".");
    const clause = rest.join(" ").split(",")[0];
    const observe = text.includes("observe mode");
    return (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-[6px] gap-y-1" title={text}>
            <span className="mono">{first}</span>
            {isRule ? null : <span>{clause}</span>}
            {observe ? <Badge>observe only</Badge> : null}
        </span>
    );
}

// The verdict rows the path above does not already show.
export function VerdictBlock({ verdict }: { verdict: Verdict }) {
    return (
        <section aria-label="Verdict">
            <SectionHeading title="Verdict" />
            <DetailList className="border-t border-line">
                <DetailRow term="Category">
                    <Badge>{verdict.category}</Badge>
                </DetailRow>
                <DetailRow term="Missing guard">
                    {verdict.missingGuard ? (
                        <MissingGuard text={verdict.missingGuard} />
                    ) : (
                        <Absent>None, guards held</Absent>
                    )}
                </DetailRow>
                {verdict.handoffFault ? (
                    <DetailRow term="Bad handoff">{sentenceCase(verdict.handoffFault)}</DetailRow>
                ) : null}
            </DetailList>

            {verdict.versions.length > 0 ? (
                <Disclosure label="Agent versions" className="mt-4">
                    <DetailList className="border-t border-line">
                        {verdict.versions.map((item) => (
                            <DetailRow
                                key={item.agent}
                                term={
                                    <TextLink href={`/agents/${encodeURIComponent(item.agent)}`} mono>
                                        {item.agent}
                                    </TextLink>
                                }
                                mono
                            >
                                {item.version}
                            </DetailRow>
                        ))}
                    </DetailList>
                </Disclosure>
            ) : null}
        </section>
    );
}
