import type { OpenApprovalItem } from "@quard/db";
import { influencePath } from "./influence";
import type { GuardDecision, RunDetail, Step, StepArg } from "../../runs/types";
import type { Label, PathNode, ValueKind } from "../../types";
import type { ParsedArg } from "./args";
import { reasonText } from "./reasons";

type Request = Pick<OpenApprovalItem, "stepId" | "agent" | "tool" | "openedAt" | "context">;

const KIND: Record<string, ValueKind> = {
    iban: "iban",
    email: "email",
    url: "url",
    host: "domain",
    path: "path",
    id: "id",
};

// Origin kinds trusted by default (PROJECT.md, Labels). Every other kind starts untrusted.
const TRUSTED = new Set(["user", "system", "tool"]);

// The context as one label: an origin that made it untrusted, else the first one read
function contextLabel(context: Request["context"]): Label {
    const untrusted = context.origins.find((origin) => !TRUSTED.has(origin.split(":")[0]));
    const origin = (context.trust === "untrusted" ? untrusted : undefined) ?? context.origins[0] ?? "instructions";
    return { origin, trust: context.trust, sensitivity: context.sensitivity };
}

// An argument as the run view keeps it, with where each traced value appeared
function stepArgOf(arg: ParsedArg, steps: Map<string, Step>, request: Request): StepArg {
    const appearances = arg.values.flatMap((value) =>
        value.origins.map((origin) => ({
            label: { origin: origin.origin, trust: origin.trust, sensitivity: origin.sensitivity },
            stepId: origin.stepId,
            agent: steps.get(origin.stepId)?.agent ?? request.agent,
            at: steps.get(origin.stepId)?.startedAt ?? request.openedAt.getTime(),
            match: origin.match,
        })),
    );
    const first = arg.values[0];
    return {
        name: arg.name,
        value: arg.masked,
        masked: arg.masked !== arg.value,
        valueLabel: {
            kind: first ? (KIND[first.type] ?? "id") : "text",
            traced: first !== undefined,
            generated: arg.values.some((value) => value.generated),
            appearances,
        },
    };
}

// The call that asked. While it waits, its tool_call event is not sent yet,
// so it is rebuilt from the request, after the model call that asked for it.
export function callOf(run: RunDetail, request: Request, args: ParsedArg[]): Step {
    const sent = run.steps.find((step) => step.id === request.stepId && step.kind === "tool_call");
    if (sent) return sent;
    const startedAt =
        run.steps.find((step) => step.parentId === request.stepId)?.startedAt ?? request.openedAt.getTime();
    const asker = run.steps.findLast(
        (step) =>
            step.kind === "model_call" &&
            step.agent === request.agent &&
            step.startedAt <= startedAt &&
            step.model?.toolCalls.includes(request.tool) === true,
    );
    const context = asker?.context ?? contextLabel(request.context);
    const steps = new Map(run.steps.map((step) => [step.id, step]));
    return {
        id: request.stepId,
        parentId: asker?.id ?? null,
        agent: request.agent,
        kind: "tool_call",
        name: request.tool,
        startedAt,
        durationMs: 0,
        status: "waiting",
        context,
        influenced: context.trust === "untrusted",
        detail: "",
        args: args.map((arg) => stepArgOf(arg, steps, request)),
        output: null,
        model: null,
        guard: null,
        link: null,
        memory: null,
        approval: null,
        hosted: false,
        error: null,
    };
}

// From the entry point to the call. Empty until the run reaches the dashboard.
export function pathOf(run: RunDetail | null, request: Request, args: ParsedArg[]): PathNode[] {
    return run ? influencePath(run, callOf(run, request, args)) : [];
}

// The guard checks of the call that asked, with their reasons in words
export function checksOf(run: RunDetail | null, request: Request): GuardDecision[] {
    return (run?.steps ?? []).flatMap((step) =>
        step.parentId === request.stepId && step.guard
            ? [{ ...step.guard, reason: reasonText(step.guard.reason, request.tool) }]
            : [],
    );
}
