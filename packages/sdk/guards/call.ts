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
};

export type Decision = "allow" | "block" | "ask";
export type Mode = "block" | "observe";

type ResultBase = {
    guard: GuardType | "permission" | "signature";
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
};

export type RuleResult = AllowResult | FailResult;
