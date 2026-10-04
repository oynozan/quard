import { LABELS_PATH, labelUpload, redactRecord, type LabelRecord, type Redactor } from "@quard/shared";
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
