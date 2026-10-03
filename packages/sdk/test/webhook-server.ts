import { createServer, type IncomingMessage } from "node:http";
import { LABELS_PATH, labelUpload, uploadBatch, type LabelRecord, type RunEvent } from "@quard/shared";

export const WEBHOOK_KEY = "qk_live_webhook_test";

async function bodyOf(req: IncomingMessage): Promise<unknown> {
    let text = "";
    for await (const chunk of req) {
        text += String(chunk);
    }
    return JSON.parse(text);
}

// A stand-in for services/webhook. Label records go into `labels`, which
// a control stand-in can share to answer lookups.
export async function startWebhookServer(labels: LabelRecord[] = [], key = WEBHOOK_KEY) {
    const events: RunEvent[] = [];
    const state = { labelStatus: 201 };
    const server = createServer((req, res) => {
        void (async () => {
            if (req.headers.authorization !== `Bearer ${key}`) {
                res.writeHead(401).end();
                return;
            }
            const body = await bodyOf(req);
            if (req.url === LABELS_PATH) {
                const parsed = labelUpload.safeParse(body);
                if (parsed.success && state.labelStatus === 201) {
                    labels.push(...parsed.data.records);
                }
                res.writeHead(parsed.success ? state.labelStatus : 400).end("{}");
                return;
            }
            const parsed = uploadBatch.safeParse(body);
            if (parsed.success) {
                events.push(...parsed.data.events.map((item) => item.event));
            }
            res.writeHead(parsed.success ? 202 : 400).end("{}");
        })();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    return {
        url: `http://127.0.0.1:${port}`,
        labels,
        events,
        state,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
}

export type WebhookServer = Awaited<ReturnType<typeof startWebhookServer>>;
