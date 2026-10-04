import { RunState, Runner, StreamedRunResult, type Agent } from "@openai/agents";
import { currentScope, finishRun, newScope, withScope } from "../../context/scope.ts";
import { unwrapBlocked } from "./blocked.ts";
import { handOff, isFrame, startToolCall, toolFrame, topFrame } from "./frames.ts";
import { carryLabels, notePause, pausedOf, takePaused, type Paused } from "./paused.ts";
import { noteSdkTools } from "./sdk-tools.ts";

type Run = (this: Runner, agent: Agent, input: unknown, options?: unknown) => Promise<unknown>;

// Model providers made by quardRunner(). An agent run as a tool runs on
// a Runner that inherits its parent's provider, so it is followed too.
const providers = new WeakSet<object>();
const watched = new WeakSet<Runner>();
let following = false;

export function followProvider(provider: object): void {
    providers.add(provider);
}

// A run() outside any quard scope starts a Quard run, or goes back into
// the run it stopped in. The run ends with the result, or for a stream,
// when the stream completes. A run stopped for the SDK's approval does
// not end until a resumed run does.
function startRun<T>(agent: Agent, paused: Paused | undefined, call: () => Promise<T>): Promise<T> {
    const back = takePaused(paused);
    const root = back?.root ?? newScope({ agent: agent.name });
    const frame = topFrame(back?.frame ?? root, agent.name);
    carryLabels(paused, root.run);
    noteSdkTools(root.run, agent);
    return new Promise<T>((resolve, reject) => {
        const follow = async () => {
            const result = await withScope(frame, () => unwrapBlocked(call()));
            if (result instanceof StreamedRunResult) {
                // The caller reads the stream while the run goes on
                resolve(result);
                await result.completed;
            }
            return result;
        };
        follow().then(
            (result) => {
                if (!notePause(result, { root, frame })) {
                    finishRun(root);
                }
                resolve(result);
            },
            (error: unknown) => {
                finishRun(root, { error });
                reject(error);
            },
        );
    });
}

function inFrame<T>(agent: Agent, input: unknown, call: () => Promise<T>): Promise<T> {
    const parent = currentScope();
    const paused = pausedOf(input);
    if (parent === undefined) {
        return startRun(agent, paused, call);
    }
    const frame = isFrame(parent) ? toolFrame(parent, agent.name) : topFrame(parent, agent.name);
    carryLabels(paused, frame.run);
    noteSdkTools(frame.run, agent);
    return withScope(frame, () => unwrapBlocked(call()));
}

// A handoff switches the agent of the frame the run loop runs in, and a
// tool call notes the model step that asked for it
function watch(runner: Runner): void {
    if (watched.has(runner)) {
        return;
    }
    watched.add(runner);
    runner.on("agent_handoff", (_context, _from, to) => {
        const current = currentScope();
        if (current !== undefined && isFrame(current)) {
            handOff(current, to.name);
            noteSdkTools(current.run, to);
        }
    });
    runner.on("agent_tool_start", (_context, _agent, _tool, { toolCall }) => {
        startToolCall(toolCall);
    });
}

// A resumed run goes on with the agent it stopped at
function startingAgent(agent: Agent, input: unknown): Agent {
    return input instanceof RunState ? input._currentAgent : agent;
}

// Follows every run() of a Runner that uses a quardRunner() provider.
// Other runners run as they are.
export function followRuns(): void {
    if (following) {
        return;
    }
    following = true;
    const original = Runner.prototype.run as unknown as Run;
    const followed: Run = function (agent, input, options) {
        const call = () => original.call(this, agent, input, options);
        if (!providers.has(this.config.modelProvider)) {
            return call();
        }
        watch(this);
        return inFrame(startingAgent(agent, input), input, call);
    };
    Runner.prototype.run = followed as unknown as Runner["run"];
}
