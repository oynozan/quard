import type { LabelRecord, LookupMessage } from "@quard/shared";

// Placeholders for now. storeLabels will send records to webhook and
// answer once they are stored; lookupLabels will ask control.

// False when no backend is set up or it could not store them in time
export async function storeLabels(records: LabelRecord[]): Promise<boolean> {
    return records.length === 0;
}

// The records behind a reference or a print. Undefined when control
// could not answer.
export async function lookupLabels(target: LookupMessage["target"]): Promise<LabelRecord[] | undefined> {
    void target;
    return undefined;
}
