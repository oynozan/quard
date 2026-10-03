import { refusalText, type ReasonCode } from "@quard/shared";

export type RefusalInput = {
    guard: string;
    tool: string;
    reason: ReasonCode;
    field?: string;
};

// What a blocked tool call returns. The model reads it as the tool result.
export class GuardRefusal {
    readonly blocked = true;
    readonly guard: string;
    readonly tool: string;
    readonly reason: ReasonCode;
    readonly field: string | undefined;
    readonly text: string;

    constructor(input: RefusalInput) {
        this.guard = input.guard;
        this.tool = input.tool;
        this.reason = input.reason;
        this.field = input.field;
        this.text = refusalText(input);
    }

    toString(): string {
        return this.text;
    }

    toJSON(): { blocked: true; guard: string; reason: ReasonCode; message: string } {
        return { blocked: true, guard: this.guard, reason: this.reason, message: this.text };
    }
}

export function isGuardRefusal(value: unknown): value is GuardRefusal {
    return value instanceof GuardRefusal;
}

// Thrown instead of returning a refusal when a guard sets onBlock: "throw"
export class GuardBlockedError extends Error {
    readonly refusal: GuardRefusal;

    constructor(refusal: GuardRefusal) {
        super(refusal.text);
        this.name = "GuardBlockedError";
        this.refusal = refusal;
    }

    get guard(): string {
        return this.refusal.guard;
    }

    get reason(): ReasonCode {
        return this.refusal.reason;
    }
}
