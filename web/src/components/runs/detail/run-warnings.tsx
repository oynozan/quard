import type { ReactNode } from "react";
import { WarningRule } from "@/components/kit/feedback/feedback";
import type { RunWarning } from "@/lib/data/runs/types";

const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

// A warning the SDK recorded, in plain words. An unknown code shows as itself.
export function warningText({ code, tool, reason }: RunWarning): ReactNode {
    const name = tool ? <Mono>{tool}</Mono> : null;
    switch (code) {
        case "unwrapped_tool":
            return (
                <>
                    {name ?? "A tool"} is not wrapped with <Mono>guard()</Mono>, so it is recorded but never stopped
                </>
            );
        case "detector_error":
            return (
                <>
                    The detector could not check what {name ?? "a tool"} returned
                    {reason ? (
                        <>
                            : <Mono>{reason}</Mono>
                        </>
                    ) : null}
                </>
            );
        case "unreadable_request":
            return "A model request could not be read, so its call was not checked";
        case "unguarded_x402":
            return "A signed payment was not sent, because no x402 guard checked it";
        case "label_record_not_stored":
            return "A message's labels could not be stored, so its receiver reads it as untrusted";
        case "label_record_not_found":
            return "A received message had no stored labels, so it was not verified";
        default:
            return (
                <>
                    The SDK warned <Mono>{code}</Mono>
                </>
            );
    }
}

type Group = { key: string; warning: RunWarning; count: number };

// The same warning from the same agent shows once, with how often it came
function grouped(warnings: RunWarning[]): Group[] {
    const groups = new Map<string, Group>();
    for (const warning of warnings) {
        const key = JSON.stringify([warning.agent, warning.code, warning.tool, warning.reason]);
        const group = groups.get(key);
        groups.set(key, { key, warning: group?.warning ?? warning, count: (group?.count ?? 0) + 1 });
    }
    return [...groups.values()];
}

// Amber rules for what the SDK could not check or record in this run
export function RunWarnings({ warnings }: { warnings: RunWarning[] }) {
    if (warnings.length === 0) return null;
    return (
        <section aria-label="Warnings" className="mb-[26px] grid gap-4">
            {grouped(warnings).map(({ key, warning, count }) => (
                <WarningRule
                    key={key}
                    title={warningText(warning)}
                    note={
                        <>
                            By <Mono>{warning.agent}</Mono>
                            {count > 1 ? (
                                <>
                                    {" "}
                                    · <Mono>{count}</Mono> times
                                </>
                            ) : null}
                        </>
                    }
                />
            ))}
        </section>
    );
}
