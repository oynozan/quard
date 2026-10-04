import type { RunEvent } from "quard";
import type { Check } from "./tools.ts";

export type Detection = {
    tool: string | null;
    guard: string;
    rule: string;
    decision: "block" | "ask" | "flag" | "strip";
    enforced: boolean;
    reason: string | null;
};

// The last stdout line of a run, for scripts and tests: "@result " + JSON
export type SandboxResult = {
    runId: string;
    status: "completed" | "failed" | "blocked";
    answer: string | null;
    error: string | null;
    recorded: boolean;
    detections: Detection[];
    timing: { totalMs: number; modelMs: number; modelCalls: number; checks: Check[] };
    tokens: { input: number; output: number };
};

export type RunRecord = {
    runId: string;
    answer: string | null;
    recorded: boolean;
    totalMs: number;
    events: RunEvent[];
    checks: Check[];
};

type Finished = Extract<RunEvent, { type: "run_finished" }>;
type ModelCall = Extract<RunEvent, { type: "model_call" }>;

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

// Every decision that is not allow or pass, in order
function detections(events: RunEvent[]): Detection[] {
    return events.flatMap((event) =>
        event.type === "decision" && event.decision !== "allow" && event.decision !== "pass"
            ? [
                  {
                      tool: event.tool,
                      guard: event.guard,
                      rule: event.rule,
                      decision: event.decision,
                      enforced: event.enforced,
                      reason: event.reason ?? null,
                  },
              ]
            : [],
    );
}

export function buildResult(run: RunRecord): SandboxResult {
    // quard.run() always records how the run ended, run limits included
    const end = run.events.find((event) => event.type === "run_finished") as Finished;
    const models = run.events.filter((event): event is ModelCall => event.type === "model_call");
    return {
        runId: run.runId,
        status: end.status,
        answer: run.answer,
        error: end.error ?? null,
        recorded: run.recorded,
        detections: detections(run.events),
        timing: {
            totalMs: Math.round(run.totalMs),
            modelMs: Math.round(sum(models.map((call) => call.durationMs))),
            modelCalls: models.length,
            checks: run.checks,
        },
        tokens: {
            input: sum(models.map((call) => call.usage?.inputTokens ?? 0)),
            output: sum(models.map((call) => call.usage?.outputTokens ?? 0)),
        },
    };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function detectionText({ tool, guard, rule, decision, enforced, reason }: Detection): string {
    const what = enforced ? decision : `would ${decision} (observe mode)`;
    const why = reason === null ? "" : `: ${reason.replaceAll(",", ", ")}`;
    return `  ${tool ?? "the run"}: ${guard} guard, rule ${rule}, ${what}${why}`;
}

// What a person reads at the end of a run, before the "@result" line
export function summaryLines(result: SandboxResult): string[] {
    const { timing } = result;
    const checks = timing.checks.map((check) => check.ms);
    const quard =
        checks.length === 0
            ? "no tool calls"
            : `${sum(checks)} ms in Quard over ${checks.length} tool calls (slowest ${Math.max(...checks)} ms)`;
    return [
        `Result: ${result.status}${result.error === null ? "" : `, ${result.error}`}`,
        ...(result.detections.length === 0
            ? ["Detected: nothing"]
            : ["Detected:", ...result.detections.map(detectionText)]),
        result.recorded
            ? `Sent to the dashboard as run ${result.runId}. A block or flagged content opens an incident there.`
            : "Not sent to the dashboard: set QUARD_AGENT_KEY in sandbox/.env and start webhook.",
        `Time: ${seconds(timing.totalMs)} in all, ${seconds(timing.modelMs)} in ${timing.modelCalls} model calls, ${quard}`,
    ];
}
