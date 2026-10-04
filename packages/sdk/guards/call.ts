import type { ContextLabel, ReasonCode } from "@quard/shared";
import type { RunState } from "../context/run.ts";
import type { ArgumentLabel } from "../labels/value-labels.ts";
import type { GuardType } from "./types.ts";

// What a guard sees about one tool call
export type GuardCall = {
    tool: string;
    input: unknown;
    agent: string;
    runId: string;
    stepId: string;
    context: ContextLabel;
    values: ArgumentLabel[];
    run: RunState;
    // Delegation levels below the agent that started the run
    depth: number;
};

export type Decision = "allow" | "block" | "ask";
export type Mode = "block" | "observe";

// "abort" refuses a call its caller gave up on
type ResultBase = {
    guard: GuardType | "permission" | "signature" | "abort";
    rule: string;
    mode: Mode;
};

export type AllowResult = ResultBase & {
    decision: "allow";
    reason?: undefined;
    field?: undefined;
};

// A block or an ask always says why
export type FailResult = ResultBase & {
    decision: "block" | "ask";
    reason: ReasonCode;
    field?: string;
    // Seconds an ask waits at most, from its guard's timeout
    timeout?: number;
};

export type RuleResult = AllowResult | FailResult;
