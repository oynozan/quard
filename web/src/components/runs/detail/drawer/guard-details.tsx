import { Absent, DetailList, DetailRow, StatusValue } from "@/components/kit/detail/detail-list";
import type { GuardDecision } from "@/lib/data/runs/types";
import { GUARD_WORD, decisionWord } from "../lib/words";

function decisionTone(guard: GuardDecision): "context" | "warning" | "danger" | "off" {
    if (guard.outcome === "block") return guard.mode === "observe" ? "off" : "danger";
    if (guard.outcome === "ask") return guard.mode === "observe" ? "off" : "warning";
    return "context";
}

// The guard's decision with the rule that made it and how it was sent.
export function GuardDetails({ guard }: { guard: GuardDecision }) {
    return (
        <>
            <DetailList>
                <DetailRow term="Decision">
                    <StatusValue tone={decisionTone(guard)}>{decisionWord(guard)}</StatusValue>
                </DetailRow>
                <DetailRow term="Guard">{GUARD_WORD[guard.guard]}</DetailRow>
                <DetailRow term="Tool" mono>
                    {guard.tool}
                </DetailRow>
                <DetailRow term="Rule" mono>
                    {guard.rule}
                </DetailRow>
                <DetailRow term="Rule hash" mono>
                    {guard.ruleHash}
                </DetailRow>
                <DetailRow term="Rules hash" mono>
                    {guard.rulesHash}
                </DetailRow>
                <DetailRow term="Mode">
                    {guard.mode === "observe" ? (
                        "Observe"
                    ) : guard.mode === "block" ? (
                        "Enforce"
                    ) : (
                        <Absent>Always asks</Absent>
                    )}
                </DetailRow>
                <DetailRow term="Degraded">{guard.degraded ? "Yes, sent late" : "No"}</DetailRow>
                {guard.scan ? (
                    <DetailRow term="Jev score" mono>
                        {guard.scan.jevScore === null ? <Absent>Not scored</Absent> : guard.scan.jevScore.toFixed(2)}
                    </DetailRow>
                ) : null}
            </DetailList>
            <p className="mt-3 text-[13px] leading-[1.7] text-ink-soft">{guard.reason}</p>
            {guard.scan?.findings.length ? (
                <ul className="mt-3 grid gap-1 text-[12px] leading-[1.6] text-ink-note">
                    {guard.scan.findings.map((finding) => (
                        <li key={finding}>{finding}</li>
                    ))}
                </ul>
            ) : null}
        </>
    );
}
