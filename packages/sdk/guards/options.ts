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
    // For origin "agent": where the message keeps what quard.inject() returned
    carrierOf?: (input: unknown) => unknown;
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
    // Seconds to wait for an answer, with no limit by default
    timeout?: number;
};

// What an egress guard does with sensitive data in what it sends
export type DataAction = "allow" | "mask" | "block";

export type EgressOptions = Common & {
    type: "egress";
    allow?: string[];
    destinations?: (input: unknown) => string[];
    onFail?: "block" | "ask";
    // Kinds left out follow the policy file's strictness preset
    payload?: { secrets?: DataAction; cards?: DataAction; ibans?: DataAction };
};

export type LimitOptions = Common & {
    type: "limit";
    maxCallsPerRun?: number;
    maxAmountPerRun?: { field: string; max: number };
    // Per UTC day, across every process of the project
    maxCallsPerDay?: number;
    maxAmountPerDay?: { field: string; max: number };
    // Fields whose IBANs, emails and domains the fleet check watches
    fleetCheck?: string[];
    // For a send or delegate tool: the argument that names the receiving agent
    delegateTo?: string;
};

export type GuardOptions = SourceOptions | ActionOptions | ApprovalOptions | EgressOptions | LimitOptions;
