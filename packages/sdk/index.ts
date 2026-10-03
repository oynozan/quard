import { agentScope, runScope } from "./context/scope.ts";
import { wrap } from "./monitor/wrap.ts";
import { configureQuard } from "./transport/configure.ts";

// The SDK's main object. inject and resume arrive with M4.
export const quard = {
    wrap,
    run: runScope,
    agent: agentScope,
    configure: configureQuard,
};

export { GuardBlockedError, GuardRefusal, isGuardRefusal } from "./core/refusal.ts";
export { GUARD_TYPES, isGuardType } from "./guards/types.ts";
export { guard } from "./pipeline/guard.ts";
export type { RunEvent } from "@quard/shared";
export type { ApprovalAnswer, ApprovalRequest, QuardConfig } from "./core/config.ts";
export type { AgentOptions, RunOptions } from "./context/scope.ts";
export type { GuardCall, RuleResult } from "./guards/call.ts";
export type {
    ActionOptions,
    ActionRule,
    ApprovalOptions,
    EgressOptions,
    GuardOptions,
    LimitOptions,
    SourceOptions,
} from "./guards/options.ts";
export type { GuardType } from "./guards/types.ts";
