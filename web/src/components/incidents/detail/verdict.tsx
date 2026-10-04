import { Glyph } from "@/components/icons/glyphs";
import { SectionHeading } from "@/components/kit/headings";
import { Badge } from "@/components/kit/labels";
import { TextLink } from "@/components/kit/links";
import { Absent, DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import type { AcrossAgents, MissingGuard as Missing, Verdict, VerdictHandoff } from "@/lib/data/incidents/types";
import { sentenceCase } from "../lib/labels";
import { Disclosure } from "./disclosure";

// The tool and its rule, a badge when the rule only records, then what was missing
function MissingGuard({ guard }: { guard: Missing }) {
    return (
        <span className="flex flex-col items-end gap-1">
            <span className="inline-flex flex-wrap items-center justify-end gap-x-[6px] gap-y-1">
                <span className="mono">{guard.tool}</span>
                {guard.rule ? <span className="mono text-ink-2">{guard.rule}</span> : null}
                {guard.observe ? <Badge>observe only</Badge> : null}
            </span>
            <span className="text-[12px] text-ink-muted">{guard.text}</span>
        </span>
    );
}

const LINK_WORD: Record<VerdictHandoff["kind"], string> = {
    message: "Message",
    handoff: "Handoff",
    tool: "Agent run as a tool",
};

function AgentLink({ agent }: { agent: string }) {
    return (
        <TextLink href={`/agents/${encodeURIComponent(agent)}`} mono>
            {agent}
        </TextLink>
    );
}

// The kind, "from › to", and whether the receiver matched its label record
function Handoff({ handoff }: { handoff: VerdictHandoff }) {
    return (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-[6px] gap-y-1">
            <span className="text-ink-2">{LINK_WORD[handoff.kind]}</span>
            <span className="mono inline-flex items-center gap-1">
                {handoff.from}
                <Glyph name="chevronRight" size={11} className="opacity-60" />
                <span className="sr-only">to</span>
                {handoff.to}
            </span>
            <Badge>{handoff.verified ? "verified" : "not verified"}</Badge>
        </span>
    );
}

// Which agent played each part, in path order
function AgentRows({ across }: { across: AcrossAgents }) {
    return (
        <>
            <DetailRow term="Entry agent">
                <AgentLink agent={across.entryAgent} />
            </DetailRow>
            <DetailRow term="Carried by">
                {across.handoff ? <Handoff handoff={across.handoff} /> : <Absent>No handoff found</Absent>}
            </DetailRow>
            <DetailRow term="Turning agent">
                <AgentLink agent={across.turningAgent} />
            </DetailRow>
            <DetailRow term="Damage agent">
                <AgentLink agent={across.damageAgent} />
            </DetailRow>
        </>
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
                        <MissingGuard guard={verdict.missingGuard} />
                    ) : (
                        <Absent>None, guards held</Absent>
                    )}
                </DetailRow>
                {verdict.handoffFault ? (
                    <DetailRow term="Bad handoff">{sentenceCase(verdict.handoffFault)}</DetailRow>
                ) : null}
                {verdict.acrossAgents ? <AgentRows across={verdict.acrossAgents} /> : null}
            </DetailList>

            {verdict.versions.length > 0 ? (
                <Disclosure label="Agent versions" className="mt-4">
                    <DetailList className="border-t border-line">
                        {verdict.versions.map((item) => (
                            <DetailRow key={item.agent} term={<AgentLink agent={item.agent} />} mono>
                                {item.version}
                            </DetailRow>
                        ))}
                    </DetailList>
                </Disclosure>
            ) : null}
        </section>
    );
}
