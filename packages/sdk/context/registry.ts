import { extractValues, type Label, type ReasonCode } from "@quard/shared";
import { textOf } from "../labels/text-of.ts";
import { canonicalJson } from "./canonical.ts";
import type { RunState } from "./run.ts";
import type { Scope } from "./scope.ts";

export type BlockedMark = {
    guard: string;
    reason: ReasonCode;
};

// A tool call the model asked for, as seen by the monitor
export type RequestedCall = {
    callId: string;
    tool: string;
    argsKey: string;
    // Value keys in the arguments; a result that echoes them gains no trust
    argKeys: ReadonlySet<string>;
    scope: Scope;
    stepId: string;
    blocked: BlockedMark | undefined;
    claimed: boolean;
    // Label of the tool's result, set by guard()
    outputLabel: Label | undefined;
};

const MAX_ENTRIES = 10_000;
const calls = new Map<string, RequestedCall>();
const responses = new Map<string, Scope>();
const conversations = new Map<string, Scope>();
const guardedTools = new Set<string>();

function remember<V>(map: Map<string, V>, key: string, value: V): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > MAX_ENTRIES) {
        map.delete(map.keys().next().value as string);
    }
}

export function registerCall(input: {
    callId: string;
    tool: string;
    args: unknown;
    scope: Scope;
    stepId: string;
    blocked?: BlockedMark;
}): RequestedCall {
    const call: RequestedCall = {
        callId: input.callId,
        tool: input.tool,
        argsKey: canonicalJson(input.args),
        argKeys: new Set(extractValues(textOf(input.args)).flatMap((value) => value.keys)),
        scope: input.scope,
        stepId: input.stepId,
        blocked: input.blocked,
        claimed: false,
        outputLabel: undefined,
    };
    remember(calls, call.callId, call);
    return call;
}

export function findCall(callId: string): RequestedCall | undefined {
    return calls.get(callId);
}

// guard() claims an open call with the same tool and arguments. Inside a
// run, only calls from that run count. A blocked mark always wins, and
// outside a run an unmatched blocked call for the tool still counts.
export function claimCall(tool: string, args: unknown, run?: RunState): RequestedCall | undefined {
    const key = canonicalJson(args);
    const open = [...calls.values()].filter(
        (call) => !call.claimed && call.tool === tool && (run === undefined || call.scope.run === run),
    );
    const exact = open.filter((call) => call.argsKey === key);
    const chosen =
        exact.find((call) => call.blocked !== undefined) ??
        exact[0] ??
        (run === undefined ? open.find((call) => call.blocked !== undefined) : undefined);
    if (chosen !== undefined) {
        chosen.claimed = true;
    }
    return chosen;
}

export function registerResponse(responseId: string, scope: Scope): void {
    remember(responses, responseId, scope);
}

export function findResponse(responseId: string): Scope | undefined {
    return responses.get(responseId);
}

export function registerConversation(conversationId: string, scope: Scope): void {
    remember(conversations, conversationId, scope);
}

export function findConversation(conversationId: string): Scope | undefined {
    return conversations.get(conversationId);
}

export function registerGuardedTool(name: string): void {
    guardedTools.add(name);
}

export function isGuardedTool(name: string): boolean {
    return guardedTools.has(name);
}

export function clearRegistry(): void {
    calls.clear();
    responses.clear();
    conversations.clear();
    guardedTools.clear();
}
