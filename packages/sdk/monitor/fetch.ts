import { newStepId, usageOf, type TokenUsage } from "@quard/shared";
import { now, record } from "../core/recorder.ts";
import { BLOCKED_ERROR_TYPE, type GuardRefusal } from "../core/refusal.ts";
import { findCall, findConversation, findResponse, registerResponse } from "../context/registry.ts";
import { currentScope, newScope, type Scope } from "../context/scope.ts";
import { checkModelCall, countModelCall } from "../guards/limit/model-limits.ts";
import { isShared } from "../guards/limit/run-counts.ts";
import { uploadsOn } from "../transport/configure.ts";
import { addCost, countSharedModelCall } from "../pipeline/count/steps.ts";
import { activeControl } from "../transport/link/active.ts";
import { checkRequestedCalls } from "./check.ts";
import { seeHostedItem } from "./hosted/items.ts";
import { shapedRequest } from "./hosted/shape.ts";
import { labelInput } from "./input-labels.ts";
import { asRecord, parseJson } from "./json.ts";
import { readResponsesRequest, type ResponsesRequest } from "./request.ts";
import { functionCallOf, functionCallsOf, outputTextOf, responseIdOf, type FunctionCall } from "./response.ts";
import { tapSse } from "./sse.ts";
import type { Step } from "./step.ts";
import { rememberVersion, versionOf } from "./versions.ts";

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// A 403 the OpenAI client won't retry, carrying the refusal as its API error
function refusedResponse(refusal: GuardRefusal): Response {
    const error = { message: refusal.text, type: BLOCKED_ERROR_TYPE, code: refusal.reason, param: null };
    return new Response(JSON.stringify({ error }), {
        status: 403,
        headers: { "content-type": "application/json", "x-should-retry": "false" },
    });
}

// ponytail: agents that resend the whole input each call pass this cap on
// long runs; dedupe input items by keyed hash per run if that matters
const MAX_CALL_TEXT = 512 * 1024;

type CallText = { requestBody?: Record<string, unknown>; outputText?: string[] };

// The body replay resends and the model's answer, as one size. Kept only
// while uploads are on, or the event buffer would hold them for nothing.
function callTextOf(step: Step, outputText: string[]): CallText {
    const requestBody = step.request.replayBody;
    const size = JSON.stringify(requestBody).length + JSON.stringify(outputText).length;
    return uploadsOn() && size <= MAX_CALL_TEXT ? { requestBody, outputText } : {};
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

function recordModelCall(
    step: Step,
    status: "ok" | "error",
    responseId?: string,
    calls: FunctionCall[] = [],
    usage?: TokenUsage,
    outputText: string[] = [],
): void {
    // One clock read, so at minus durationMs is the start
    const end = Date.now();
    record({
        type: "model_call",
        runId: step.scope.run.runId,
        stepId: step.stepId,
        agent: step.scope.agent,
        at: new Date(end).toISOString(),
        parentStepId: step.scope.parentStepId,
        model: step.request.model,
        responseId,
        toolCalls: calls.map((call) => ({ callId: call.callId, name: call.name, arguments: call.arguments })),
        status,
        durationMs: end - step.started,
        agentVersion: step.version,
        ...(usage === undefined ? {} : { usage }),
        ...callTextOf(step, outputText),
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
    const output = asRecord(response)?.output;
    (Array.isArray(output) ? output : []).forEach((item) => seeHostedItem(step, item));
    const calls = functionCallsOf(response);
    calls.forEach(check);
    const responseId = responseIdOf(response);
    if (responseId !== undefined) {
        registerResponse(responseId, step.scope);
    }
    const usage = usageOf(response);
    addCost(step.scope.run, step.request.model, usage);
    recordModelCall(step, status, responseId, calls, usage, outputTextOf(response));
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
        } else if (data?.type === "response.output_item.done") {
            seeHostedItem(step, data.item);
            if (started !== undefined) {
                check(started);
            }
        } else if (data?.type === "response.completed" || data?.type === "response.incomplete") {
            finishResponse(step, data.response, check, "ok");
        } else if (data?.type === "response.failed") {
            finishResponse(step, data.response, check, "error");
        }
    });
}

// Fetches made here. A client copied from a wrapped one keeps its
// fetch, so this spots it where the client itself would not.
const monitorFetches = new WeakSet<Fetch>();

export function isMonitorFetch(fetch: Fetch | undefined): boolean {
    return fetch !== undefined && monitorFetches.has(fetch);
}

// The monitor: every Responses API call passes through here
export function createMonitorFetch(inner: Fetch): Fetch {
    const monitor: Fetch = async (input, init) => {
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
        const stepId = newStepId();
        // A call over an enforced run limit never leaves the process. A
        // shared run counts its step through control while checking.
        const shared = isShared(scope.run);
        const modelCall = { run: scope.run, agent: scope.agent, stepId, model: request.model };
        const refused = shared ? await countSharedModelCall(modelCall) : checkModelCall(modelCall);
        if (refused !== undefined) {
            return refusedResponse(refused);
        }
        const version = versionOf(request.model, request.instructions, request.tools);
        const step: Step = { scope, stepId, request, started: Date.now(), version, hosted: new Set() };
        scope.lastStepId = step.stepId;
        noteVersion(step);
        labelInput(step);

        if (!shared) {
            countModelCall(scope.run);
        }
        // Hosted tools can't be stopped mid-call, so the request is shaped first
        const [sentInput, sentInit] = shapedRequest(input, init, request.body);
        let response: Response;
        try {
            response = await inner(sentInput, sentInit);
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
    monitorFetches.add(monitor);
    return monitor;
}
