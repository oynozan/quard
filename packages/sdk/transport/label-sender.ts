import { LABELS_PATH, labelUpload, type LabelRecord, type Redactor } from "@quard/shared";
import type { Send } from "./uploader.ts";

export type LabelSenderOptions = {
    webhookUrl: string;
    key: string;
    redactor: Redactor;
    send?: Send;
    timeoutMs?: number;
};

// True only once webhook stored every record
export type LabelSender = (records: LabelRecord[]) => Promise<boolean>;

// How long a message waits for its label record to be stored
export const STORE_MS = 5_000;
// Webhook takes at most this many records per request
const MAX_RECORDS = 100;

// Names and origins can hold emails or secrets, while hashes and ids stay as they are
function redactRecord(record: LabelRecord, redactor: Redactor): LabelRecord {
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

// Sends label records at once, not in the event batches
export function createLabelSender(options: LabelSenderOptions): LabelSender {
    const send = options.send ?? fetch;
    const url = `${options.webhookUrl.replace(/\/+$/, "")}${LABELS_PATH}`;
    const timeoutMs = options.timeoutMs ?? STORE_MS;

    async function post(records: LabelRecord[]): Promise<boolean> {
        const body = labelUpload.safeParse({
            records: records.map((record) => redactRecord(record, options.redactor)),
        });
        if (!body.success) {
            return false;
        }
        try {
            const res = await send(url, {
                method: "POST",
                headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
                body: JSON.stringify(body.data),
                signal: AbortSignal.timeout(timeoutMs),
            });
            return res.status === 201;
        } catch {
            return false;
        }
    }

    return async (records) => {
        for (let at = 0; at < records.length; at += MAX_RECORDS) {
            if (!(await post(records.slice(at, at + MAX_RECORDS)))) {
                return false;
            }
        }
        return true;
    };
}
