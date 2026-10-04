import { newEventId, type LabelRecord, type LookupMessage } from "@quard/shared";
import { sendLabels, waitForHashKey } from "./configure.ts";
import { activeControl } from "./link/active.ts";

// How long a call that hashes for the backend waits for the project's key
export const KEY_WAIT_MS = 5_000;

// Hashes that leave the process must match the backend's, so a call that
// makes them waits for the project's key first. Undefined with no backend,
// else whether the key came in time.
export function waitForKey(): Promise<boolean | undefined> {
    return waitForHashKey(KEY_WAIT_MS);
}

// False when uploads are off or webhook could not store them in time
export function storeLabels(records: LabelRecord[]): Promise<boolean> {
    return records.length === 0 ? Promise.resolve(true) : sendLabels(records);
}

// The records behind a reference or a print, undefined when control can't answer in time
export async function lookupLabels(target: LookupMessage["target"]): Promise<LabelRecord[] | undefined> {
    const control = activeControl();
    if (control === undefined) {
        return undefined;
    }
    // A process that just started may get a message before its link is up
    const reply = await control.requests.request(
        { type: "lookup", id: newEventId(), target },
        { ms: control.replyMs, waitForStart: true },
    );
    return reply?.type === "labels" ? reply.records : undefined;
}
