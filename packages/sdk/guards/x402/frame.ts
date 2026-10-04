import { AsyncLocalStorage } from "node:async_hooks";
import type { GuardRefusal } from "../../core/refusal.ts";

// A payment the x402 guard refused while a guarded tool ran. The x402
// client throws on a refusal, so the tool returns this refusal instead.
export type Refused = { refusal: GuardRefusal; onBlock: "return" | "throw" };

type Frame = { refused?: Refused };

const frames = new AsyncLocalStorage<Frame>();

// What a guarded tool's run gives back when a payment in it was refused
export class PaymentRefused {
    readonly refused: Refused;

    constructor(refused: Refused) {
        this.refused = refused;
    }
}

export function newFrame(): Frame {
    return {};
}

export function inFrame<T>(frame: Frame, fn: () => T): T {
    return frames.run(frame, fn);
}

// Keeps the refusal for the guarded tool the payment ran in, if any
export function noteRefused(refused: Refused): void {
    const frame = frames.getStore();
    if (frame !== undefined) {
        frame.refused = refused;
    }
}
