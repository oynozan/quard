import type { LabelRecord } from "../labels/records.ts";
import type { Redactor } from "./redactor.ts";

// What a label record may hold once it leaves the process. Names and
// origins can hold emails or secrets, while hashes and ids stay as they
// are. Already redacted text comes out the same.
export function redactRecord(record: LabelRecord, redactor: Redactor): LabelRecord {
    const text = redactor.text;
    const label = { ...record.label, origins: record.label.origins.map(text) };
    const values = record.values.map((value) => ({
        ...value,
        origin: text(value.origin),
        flags: value.flags.map(text),
    }));
    if (record.kind === "memory") {
        return { ...record, store: text(record.store), agent: text(record.agent), label, values };
    }
    const tools = record.tools?.map(text);
    return { ...record, sender: text(record.sender), label, values, ...(tools === undefined ? {} : { tools }) };
}
