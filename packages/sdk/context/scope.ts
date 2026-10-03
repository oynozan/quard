import { AsyncLocalStorage } from "node:async_hooks";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { isBlockedError } from "../core/refusal.ts";
import { newRun, type RunState } from "./run.ts";

export type Scope = {
    run: RunState;
    agent: string;
    parentStepId: string | undefined;
    // undefined means the agent may use every guarded tool
    tools: ReadonlySet<string> | undefined;
    lastStepId: string | undefined;
    // Delegation levels below the agent that started the run
    depth: number;
};

export type RunOptions = {
    agent?: string;
    runId?: string;
    tools?: string[];
};

export type AgentOptions = {
    tools?: string[];
};

const storage = new AsyncLocalStorage<Scope>();

export function currentScope(): Scope | undefined {
    return storage.getStore();
}

// Starts a new run and records the origin overrides in force
export function newScope(options: RunOptions = {}): Scope {
    const scope: Scope = {
        run: newRun(options.runId),
        agent: options.agent ?? "default",
        parentStepId: undefined,
        tools: options.tools === undefined ? undefined : new Set(options.tools),
        lastStepId: undefined,
        depth: 0,
    };
    record({
        type: "run_started",
        runId: scope.run.runId,
        agent: scope.agent,
        at: now(),
        origins: getConfig().origins,
    });
    return scope;
}

export function withScope<T>(scope: Scope, fn: () => T): T {
    return storage.run(scope, fn);
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
    return typeof (value as { then?: unknown } | null)?.then === "function";
}

// Records how a run's function finished, so the dashboard need not guess
function finishRun(scope: Scope, failure?: { error: unknown }): void {
    const error = failure?.error;
    record({
        type: "run_finished",
        runId: scope.run.runId,
        agent: scope.agent,
        at: now(),
        status: failure === undefined ? "completed" : isBlockedError(error) ? "blocked" : "failed",
        ...(failure === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
    });
}

// quard.run(): everything inside shares one run, and its end is recorded
export function runScope<T>(options: RunOptions, fn: () => T): T {
    const scope = newScope(options);
    let result: T;
    try {
        result = withScope(scope, fn);
    } catch (error) {
        finishRun(scope, { error });
        throw error;
    }
    if (!isPromise(result)) {
        finishRun(scope);
        return result;
    }
    return result.then(
        (value) => {
            finishRun(scope);
            return value;
        },
        (error: unknown) => {
            finishRun(scope, { error });
            throw error;
        },
    ) as T;
}

// Delegation can only narrow what an agent may use
export function narrowTools(
    parent: ReadonlySet<string> | undefined,
    own: string[] | undefined,
): ReadonlySet<string> | undefined {
    if (own === undefined) {
        return parent;
    }
    return new Set(parent === undefined ? own : own.filter((tool) => parent.has(tool)));
}

// quard.agent(): a child agent inside the current run
export function agentScope<T>(name: string, fn: () => T, options: AgentOptions = {}): T {
    const parent = currentScope();
    if (parent === undefined) {
        throw new Error("quard.agent() must be called inside quard.run()");
    }
    return withScope(
        {
            run: parent.run,
            agent: name,
            parentStepId: parent.lastStepId,
            tools: narrowTools(parent.tools, options.tools),
            lastStepId: undefined,
            depth: parent.depth + 1,
        },
        fn,
    );
}

export function mayUse(scope: Scope, tool: string): boolean {
    return scope.tools === undefined || scope.tools.has(tool);
}
