import {
    clientMessage,
    CONTROL_PATH,
    type ApprovalAnswer,
    type ClientMessage,
    type LabelRecord,
    type QuarantineEntry,
    type ReadyMessage,
    type ServerMessage,
} from "@quard/shared";
import { WebSocketServer, type WebSocket } from "ws";
import { READY } from "./fake-socket.ts";

export const CONTROL_KEY = "qk_live_control_test";

type Waiter = { match: (message: ClientMessage) => boolean; resolve: (message: ClientMessage) => void };

// The records a lookup finds, like control reading them from Postgres
function lookupIn(labels: readonly LabelRecord[], message: Extract<ClientMessage, { type: "lookup" }>): LabelRecord[] {
    const { target } = message;
    return labels
        .filter((record) =>
            target.kind === "message"
                ? record.kind === "message" && record.ref === target.ref
                : record.kind === "memory" && record.print === target.print,
        )
        .slice(0, 20);
}

// A stand-in for services/control that speaks the protocol over a real
// WebSocket. Lookups read `labels`, which a webhook stand-in can fill.
export async function startControlServer(key = CONTROL_KEY, labels: LabelRecord[] = []) {
    const server = new WebSocketServer({
        host: "127.0.0.1",
        port: 0,
        path: CONTROL_PATH,
        verifyClient: (info, done) => done(info.req.headers.authorization === `Bearer ${key}`, 401),
    });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const received: ClientMessage[] = [];
    const waiters: Waiter[] = [];
    const counters = new Map<string, number>();
    const requests = new Map<string, string>();
    const state = {
        ready: READY as ReadyMessage,
        quarantined: [] as QuarantineEntry[],
        // Answers asks at once instead of waiting for decide()
        autoAnswer: undefined as ApprovalAnswer | undefined,
        answerLookups: true,
    };

    const send = (socket: WebSocket, message: ServerMessage) => socket.send(JSON.stringify(message));

    function handle(socket: WebSocket, message: ClientMessage): void {
        if (message.type === "hello") {
            send(socket, state.ready);
        } else if (message.type === "ask") {
            const requestId = message.requestId ?? requests.get(message.argsHash) ?? `apr_${message.askId}`;
            requests.set(message.argsHash, requestId);
            send(socket, { type: "asked", askId: message.askId, requestId });
            if (state.autoAnswer !== undefined) {
                send(socket, { type: "decided", askId: message.askId, answer: state.autoAnswer, requestId });
            }
        } else if (message.type === "count") {
            const id = `${message.day}/${message.tool}/${message.counter}`;
            const used = (counters.get(id) ?? 0) + message.add;
            const ok = message.max === undefined || used <= message.max;
            if (ok) {
                counters.set(id, used);
            }
            send(socket, { type: "counted", id: message.id, ok, used: ok ? used : (counters.get(id) ?? 0) });
        } else if (message.type === "lookup" && state.answerLookups) {
            send(socket, { type: "labels", id: message.id, records: lookupIn(labels, message) });
        } else if (message.type === "fleet") {
            const quarantined = state.quarantined.filter((entry) => message.values.some((v) => v.key === entry.key));
            send(socket, { type: "fleet_result", id: message.id, quarantined, fleetObserveUntil: null });
        }
    }

    server.on("connection", (socket) => {
        socket.on("message", (data) => {
            const parsed = clientMessage.safeParse(JSON.parse(String(data)));
            if (!parsed.success) {
                send(socket, { type: "error", code: "bad_message", message: parsed.error.message });
                return;
            }
            received.push(parsed.data);
            handle(socket, parsed.data);
            for (const waiter of [...waiters]) {
                if (waiter.match(parsed.data)) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.resolve(parsed.data);
                }
            }
        });
    });

    return {
        url: `http://127.0.0.1:${port}`,
        received,
        labels,
        counters,
        state,
        connections: () => [...server.clients],
        // Sends a message to every open connection
        push: (message: ServerMessage) => server.clients.forEach((socket) => send(socket, message)),
        decide: (askId: string, answer: ApprovalAnswer, requestId?: string) =>
            server.clients.forEach((socket) => send(socket, { type: "decided", askId, answer, requestId })),
        dropAll: () => server.clients.forEach((socket) => socket.terminate()),
        // The first message, received or still to come, that matches
        waitFor<T extends ClientMessage["type"]>(
            type: T,
            match: (message: Extract<ClientMessage, { type: T }>) => boolean = () => true,
        ): Promise<Extract<ClientMessage, { type: T }>> {
            const test = (message: ClientMessage) =>
                message.type === type && match(message as Extract<ClientMessage, { type: T }>);
            const found = received.find(test);
            if (found !== undefined) {
                return Promise.resolve(found as Extract<ClientMessage, { type: T }>);
            }
            return new Promise((resolve) => {
                waiters.push({
                    match: test,
                    resolve: (message) => resolve(message as Extract<ClientMessage, { type: T }>),
                });
            });
        },
        close: () =>
            new Promise<void>((resolve) => {
                server.clients.forEach((socket) => socket.terminate());
                server.close(() => resolve());
            }),
    };
}

export type ControlServer = Awaited<ReturnType<typeof startControlServer>>;
