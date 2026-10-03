import { toBaggage } from "./context/baggage.ts";
import { inject, resume } from "./context/carrier.ts";
import { agentScope, runScope } from "./context/scope.ts";
import { wrap } from "./monitor/wrap.ts";
import { configureQuard } from "./transport/configure.ts";

// The SDK's main object. inject, resume and toBaggage carry a run between agents.
export const quard = {
    wrap,
    run: runScope,
    agent: agentScope,
    inject,
    resume,
    toBaggage,
    configure: configureQuard,
};

export { GuardBlockedError, GuardRefusal, isGuardRefusal } from "./core/refusal.ts";
export { GUARD_TYPES, isGuardType } from "./guards/types.ts";
export { guard } from "./pipeline/guard.ts";
export type { RunEvent } from "@quard/shared";
export type { ApprovalAnswer, ApprovalRequest, QuardConfig, RunLimits } from "./core/config.ts";
export type { Carrier, InjectOptions, ResumeOptions } from "./context/carrier.ts";
export type { AgentOptions, RunOptions } from "./context/scope.ts";
export { DetectorError } from "./detectors/detector.ts";
export type { Detector, DetectorRules } from "./detectors/detector.ts";
export { jevDetector } from "./detectors/jev/jev.ts";
export type { JevOptions } from "./detectors/jev/jev.ts";
export type { DetectorAnswer, DetectorLabel } from "./detectors/labels.ts";
export type { GuardCall, RuleResult } from "./guards/call.ts";
export type {
    ActionOptions,
    ActionRule,
    ApprovalOptions,
    DataAction,
    EgressOptions,
    GuardOptions,
    LimitOptions,
    SourceOptions,
} from "./guards/options.ts";
export type { GuardType } from "./guards/types.ts";
export type { SignaturesConfig } from "./policy/schema.ts";
