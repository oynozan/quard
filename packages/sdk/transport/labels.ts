import { newEventId, type LabelRecord, type LookupMessage } from "@quard/shared";
import { sendLabels } from "./configure.ts";
import { activeControl } from "./link/active.ts";

// False when uploads are off or webhook could not store them in time
export function storeLabels(records: LabelRecord[]): Promise<boolean> {
    return records.length === 0 ? Promise.resolve(true) : sendLabels(records);
}

// The records behind a reference or a print. Undefined when control
// could not answer in time.
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
