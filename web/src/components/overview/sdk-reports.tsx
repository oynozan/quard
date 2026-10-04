import { WarningRule } from "@/components/kit/feedback/feedback";
import type { ConfigError, SdkReports as Reports } from "@/lib/data/sdk-reports";
import { formatAge, formatInt } from "@/lib/format";

const SOURCE_WORD: Record<ConfigError["source"], string> = {
    policy: "The policy file",
    signatures: "The signature feed",
};

const Mono = ({ value }: { value: string }) => <span className="mono">{value}</span>;

// Config that failed to load and events SDKs lost. Hidden when there is neither.
export function SdkReports({ reports, now }: { reports: Reports; now: number }) {
    const { configErrors, dropped } = reports;
    if (configErrors.length === 0 && !dropped) return null;
    return (
        <section aria-label="SDK problems" className="reveal mt-[30px] grid gap-4 max-[760px]:mt-[25px]">
            {configErrors.map((error) => (
                <WarningRule
                    key={`${error.source}:${error.message}`}
                    title={`${SOURCE_WORD[error.source]} failed to load, so the last good one stays in use.`}
                    note={
                        <>
                            {error.message} · <Mono value={formatInt(error.count)} />{" "}
                            {error.count === 1 ? "time" : "times"}, last{" "}
                            <Mono value={formatAge(error.lastSeenAt, now)} /> ago
                        </>
                    }
                />
            ))}
            {dropped ? (
                <WarningRule
                    title={
                        <>
                            <Mono value={formatInt(dropped.count)} />{" "}
                            {dropped.count === 1 ? "event was" : "events were"} lost in the last 24 hours while the
                            backend could not be reached.
                        </>
                    }
                    note={
                        <>
                            Last lost <Mono value={formatAge(dropped.lastAt, now)} /> ago. Runs from that time can miss
                            steps.
                        </>
                    }
                />
            ) : null}
        </section>
    );
}
