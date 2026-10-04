import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HASH_KEY_PATH, LABELS_PATH, labelUpload, uploadBatch, type LabelRecord, type RunEvent } from "@quard/shared";
import { projectKeyOf, TEST_PROJECT } from "./hash-key.ts";

export const WEBHOOK_KEY = "qk_live_webhook_test";

async function bodyOf(req: IncomingMessage): Promise<unknown> {
    let text = "";
    for await (const chunk of req) {
        text += String(chunk);
    }
    return JSON.parse(text);
}

function reply(res: ServerResponse, status: number, body: object): void {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

// A stand-in for services/webhook that keeps label records in `labels` for
// control to share, and hands out the project's hash key to the agent key
export async function startWebhookServer(labels: LabelRecord[] = [], key = WEBHOOK_KEY, project = TEST_PROJECT) {
    const events: RunEvent[] = [];
    // keyStatus 503 plays a webhook that can't hand out the key for now
    const state = { labelStatus: 201, keyStatus: 200, keyRequests: 0 };
    const server = createServer((req, res) => {
        void (async () => {
            if (req.headers.authorization !== `Bearer ${key}`) {
                reply(res, 401, { error: "invalid_agent_key" });
                return;
            }
            if (req.method === "GET" && req.url === HASH_KEY_PATH) {
                state.keyRequests += 1;
                const ok = state.keyStatus === 200;
                reply(res, state.keyStatus, ok ? { hashKey: projectKeyOf(project) } : { error: "unavailable" });
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
