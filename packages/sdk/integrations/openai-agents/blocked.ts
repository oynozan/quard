import { StreamedRunResult, ToolCallError } from "@openai/agents";
import { GuardBlockedError } from "../../core/refusal.ts";

// The SDK wraps errors thrown in tool calls. A guard's own throw comes
// out as itself, so app code catches GuardBlockedError as usual.
function blockedOf(error: unknown): unknown {
    if (error instanceof ToolCallError && error.error instanceof GuardBlockedError) {
        error.error.cause ??= error;
        return error.error;
    }
    return error;
}

type Raise = (error: unknown, options?: unknown) => void;

// A stream gets the error through one internal method, which feeds its
// completed promise, its events and its error. So all of them reject the
// same way. An SDK without the method keeps its own error.
function unwrapStream(result: object): void {
    const target = result as { _raiseError?: Raise };
    const raise = target._raiseError;
    if (typeof raise === "function") {
        target._raiseError = (error, options) => raise.call(result, blockedOf(error), options);
    }
}

// The run's result, or for a stream, the stream with its errors unwrapped
export async function unwrapBlocked<T>(promise: Promise<T>): Promise<T> {
    let result: T;
    try {
        result = await promise;
    } catch (error) {
        throw blockedOf(error);
    }
    if (result instanceof StreamedRunResult) {
        unwrapStream(result);
    }
    return result;
}
