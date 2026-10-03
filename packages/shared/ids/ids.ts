// Run and step ids use the W3C trace format:
// a run id is 32 hex characters, a step id is 16.

const RUN_ID = /^[0-9a-f]{32}$/;
const STEP_ID = /^[0-9a-f]{16}$/;
const ALL_ZEROS = /^0+$/;

function randomHex(bytes: number): string {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The W3C format does not allow an id of all zeros
function nonZeroHex(bytes: number): string {
    let id = randomHex(bytes);
    while (ALL_ZEROS.test(id)) {
        id = randomHex(bytes);
    }
    return id;
}

export function newRunId(): string {
    return nonZeroHex(16);
}

export function newStepId(): string {
    return nonZeroHex(8);
}

export function isRunId(value: string): boolean {
    return RUN_ID.test(value) && !ALL_ZEROS.test(value);
}

export function isStepId(value: string): boolean {
    return STEP_ID.test(value) && !ALL_ZEROS.test(value);
}
