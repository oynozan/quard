import { labelFor, newStepId, type TokenUsage } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { BLOCKED_ERROR_TYPE, type GuardRefusal } from "../core/refusal.ts";
import {
    findCall,
    findConversation,
    findResponse,
    registerConversation,
    registerResponse,
} from "../context/registry.ts";
import { currentScope, newScope, type Scope } from "../context/scope.ts";
import { addModelCost, checkModelCall, countModelCall } from "../guards/limit/model-limits.ts";
import { activeControl } from "../transport/link/active.ts";
import { checkRequestedCalls } from "./check.ts";
import { asRecord, parseJson } from "./json.ts";
import { readResponsesRequest, type ResponsesRequest } from "./request.ts";
import { functionCallOf, functionCallsOf, responseIdOf, usageOf, type FunctionCall } from "./response.ts";
import { tapSse } from "./sse.ts";
import { rememberVersion, versionOf } from "./versions.ts";

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type Step = { scope: Scope; stepId: string; request: ResponsesRequest; started: number; version: string };

const UNSEEN_HISTORY = "Earlier conversation history that Quard did not see.";

// A 403 the OpenAI client won't retry, carrying the refusal as its API error
function refusedResponse(refusal: GuardRefusal): Response {
    const error = { message: refusal.text, type: BLOCKED_ERROR_TYPE, code: refusal.reason, param: null };
    return new Response(JSON.stringify({ error }), {
        status: 403,
        headers: { "content-type": "application/json", "x-should-retry": "false" },
    });
}

// The current scope, or the run of the response, conversation or tool
// call this request continues. Inside a new scope, a chained request
// brings the labels of the run it continues.
function resolveScope(request: ResponsesRequest): Scope {
    const byResponse = request.previousResponseId === undefined ? undefined : findResponse(request.previousResponseId);
    const byConversation = request.conversationId === undefined ? undefined : findConversation(request.conversationId);
    const byCall = request.callIds.map((id) => findCall(id)?.scope).find((scope) => scope !== undefined);
    const linked = byResponse ?? byConversation ?? byCall;
    const current = currentScope();
    if (current === undefined) {
        return linked ?? newScope();
    }
    if (linked !== undefined && linked.run !== current.run) {
        current.run.index.absorb(linked.run.index);
    }
    return current;
}

function recordContent(step: Step, added: { id: string; keys: string[] }, label: ReturnType<typeof labelFor>): void {
    record({
        type: "content",
        runId: step.scope.run.runId,
        stepId: step.stepId,
        agent: step.scope.agent,
        at: now(),
        contentId: added.id,
        origin: label.origin,
        trust: label.trust,
        sensitivity: label.sensitivity,
        flags: label.flags,
        keys: added.keys,
    });
}

// Labels what the model is about to read. Content seen before keeps its
// label, and so do values in it that were seen before. History Quard
// never saw counts as untrusted.
function labelInput(step: Step): void {
    const { scope, request } = step;
    const overrides = getConfig().origins;
    const add = (
        text: string,
        label: ReturnType<typeof labelFor>,
        options: Parameters<typeof scope.run.index.add>[3],
    ) => {
        const added = scope.run.index.add(text, label, step.stepId, options);
        if (added !== undefined) {
            recordContent(step, added, label);
        }
    };
    const chainedUnseen =
        (request.previousResponseId !== undefined && findResponse(request.previousResponseId) === undefined) ||
        (request.conversationId !== undefined && findConversation(request.conversationId) === undefined);
    if (chainedUnseen) {
        add(UNSEEN_HISTORY, labelFor("unknown", overrides), {});
    }
    for (const item of request.texts) {
        if (item.role === "tool") {
            const requested = findCall(item.callId);
            add(item.text, requested?.outputLabel ?? labelFor("unknown", overrides), {
                exclude: requested?.argKeys,
                keepEarlier: requested?.outputLabel === undefined,
            });
        } else {
            add(item.text, labelFor(item.role, overrides), { keepEarlier: true });
        }
    }
    if (request.conversationId !== undefined) {
        registerConversation(request.conversationId, scope);
    }
}

function recordModelCall(
    step: Step,
    status: "ok" | "error",
    responseId?: string,
    calls: FunctionCall[] = [],
    usage?: TokenUsage,
): void {
    record({
        type: "model_call",
        runId: step.scope.run.runId,
        stepId: step.stepId,
        agent: step.scope.agent,
        at: now(),
        parentStepId: step.scope.parentStepId,
        model: step.request.model,
        responseId,
        toolCalls: calls.map((call) => ({ callId: call.callId, name: call.name, arguments: call.arguments })),
        status,
        durationMs: Date.now() - step.started,
        agentVersion: step.version,
        ...(usage === undefined ? {} : { usage }),
    });
}

// Control records each agent version once, the first time this process uses it
function noteVersion(step: Step): void {
    const { model, instructions, tools } = step.request;
    const entry = { agent: step.scope.agent, version: step.version, model, tools, instructions };
    if (rememberVersion(entry)) {
        activeControl()?.sendAgent(entry);
    }
}

function finishResponse(
    step: Step,
    response: unknown,
    check: (call: FunctionCall) => void,
    status: "ok" | "error",
): void {
    const calls = functionCallsOf(response);
    calls.forEach(check);
    const responseId = responseIdOf(response);
    if (responseId !== undefined) {
        registerResponse(responseId, step.scope);
    }
    const usage = usageOf(response);
    addModelCost(step.scope.run, step.request.model, usage);
    recordModelCall(step, status, responseId, calls, usage);
}

// Each tool call is checked once, when its last event arrives
function watchStream(step: Step, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const names = new Map<string, { callId: string; name: string }>();
    const checked = new Set<string>();
    const check = (call: FunctionCall) => {
        if (!checked.has(call.callId)) {
            checked.add(call.callId);
            checkRequestedCalls([call], step.scope, step.stepId);
        }
    };
    return tapSse(body, (event) => {
        const data = asRecord(parseJson(event.data));
        const started = functionCallOf(data?.item);
        if (data?.type === "response.output_item.added" && started !== undefined) {
            names.set(String(asRecord(data.item)?.id), { callId: started.callId, name: started.name });
        } else if (data?.type === "response.function_call_arguments.done") {
            const known = names.get(String(data.item_id));
            if (known !== undefined) {
                check({ ...known, arguments: String(data.arguments) });
            }
        } else if (data?.type === "response.output_item.done" && started !== undefined) {
            check(started);
        } else if (data?.type === "response.completed" || data?.type === "response.incomplete") {
            finishResponse(step, data.response, check, "ok");
        } else if (data?.type === "response.failed") {
            finishResponse(step, data.response, check, "error");
        }
    });
}

// The monitor: every Responses API call passes through here
export function createMonitorFetch(inner: Fetch): Fetch {
    return async (input, init) => {
        const request = await readResponsesRequest(input, init);
        if (request === undefined) {
            return inner(input, init);
        }
        if (request === "unreadable") {
            // A Responses call the monitor can't read is reported, not hidden
            const scope = currentScope() ?? newScope();
            record({
                type: "warning",
                runId: scope.run.runId,
                stepId: newStepId(),
                agent: scope.agent,
                at: now(),
                code: "unreadable_request",
            });
            return inner(input, init);
        }
        const scope = resolveScope(request);
        const version = versionOf(request.model, request.instructions, request.tools);
        const step: Step = { scope, stepId: newStepId(), request, started: Date.now(), version };
        // A call over an enforced run limit never leaves the process
        const refused = checkModelCall({
            run: scope.run,
            agent: scope.agent,
            stepId: step.stepId,
            model: request.model,
        });
        if (refused !== undefined) {
            return refusedResponse(refused);
        }
        scope.lastStepId = step.stepId;
        noteVersion(step);
        labelInput(step);

        countModelCall(scope.run);
        let response: Response;
        try {
            response = await inner(input, init);
        } catch (error) {
            recordModelCall(step, "error");
            throw error;
        }
        if (!response.ok || response.body === null) {
            recordModelCall(step, "error");
            return response;
        }
        const options = { status: response.status, statusText: response.statusText, headers: response.headers };
        if (request.stream) {
            return new Response(watchStream(step, response.body), options);
        }
        const text = await response.text();
        finishResponse(step, parseJson(text), (call) => checkRequestedCalls([call], scope, step.stepId), "ok");
        return new Response(text, options);
    };
}
