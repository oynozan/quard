import type { Decision, GuardCall, Mode } from "./call.ts";

type Common = {
    // The tool name the model sees; keeps rule history stable
    name?: string;
    mode?: Mode;
    onBlock?: "return" | "throw";
};

export type SourceOptions = Common & {
    type: "source";
    // A kind such as "web", or a full origin such as "mcp:crm"
    origin: string;
    originOf?: (input: unknown) => string | undefined;
    blockDomains?: string[];
    allowDomains?: string[];
    onSuspect?: "flag" | "strip" | "block";
};

export type FromRule = { field: string; from: string[]; onFail?: "block" | "ask"; name?: string };
export type MaxRule = { field: string; max: number; onFail?: "block" | "ask"; name?: string };
export type NeverSeenRule = { field: string; neverSeen: true; onFail?: "block" | "ask"; name?: string };
export type CustomRule = {
    name: string;
    check: (call: GuardCall) => Decision | { decision: Decision; field?: string };
};

export type ActionRule = FromRule | MaxRule | NeverSeenRule | CustomRule;

export type ActionOptions = Common & {
    type: "action";
    rules: ActionRule[];
};

// Approval always asks, so it has no mode
export type ApprovalOptions = {
    type: "approval";
    name?: string;
    onBlock?: "return" | "throw";
};

export type EgressOptions = Common & {
    type: "egress";
    allow?: string[];
    destinations?: (input: unknown) => string[];
    onFail?: "block" | "ask";
};

export type LimitOptions = Common & {
    type: "limit";
    maxCallsPerRun?: number;
    maxAmountPerRun?: { field: string; max: number };
};

export type GuardOptions = SourceOptions | ActionOptions | ApprovalOptions | EgressOptions | LimitOptions;
