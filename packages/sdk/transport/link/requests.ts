import type { CountMessage, FleetMessage, LookupMessage, RunCountMessage, ServerMessage } from "@quard/shared";
import type { Link } from "./link.ts";

// What the SDK asks control, each answered with the request's id
export type Request = CountMessage | RunCountMessage | FleetMessage | LookupMessage;

export type Reply = Extract<ServerMessage, { type: "counted" | "run_counted" | "fleet_result" | "labels" }>;

const REPLIES = new Set<ServerMessage["type"]>(["counted", "run_counted", "fleet_result", "labels"]);

export type RequestOptions = {
    ms: number;
    // False for messages nothing waits on, so they never keep the process alive
    hold?: boolean;
    // Gets a reply that came after the wait, or undefined once none can come
    late?: (reply: Reply | undefined) => void;
    // Before the first connect, waits up to ms for it instead of giving up at once
    waitForStart?: boolean;
};

export type Requests = {
    // The reply, or undefined when control could not answer in time
    request(message: Request, options: RequestOptions): Promise<Reply | undefined>;
    stop(): void;
};

const MAX_LATE = 1000;

function isReply(message: ServerMessage): message is Reply {
    return REPLIES.has(message.type);
}

// Matches control's answers to the requests sent, by id
export function createRequests(link: Link): Requests {
    const pending = new Map<string, (reply: Reply | undefined) => void>();
    const late = new Map<string, (reply: Reply | undefined) => void>();
    // Requests made before the first connect, sent once it is up
    const starting = new Map<string, Request>();
    let started = false;

    function answer(id: string, reply: Reply | undefined): void {
        const done = pending.get(id) ?? late.get(id);
        late.delete(id);
        done?.(reply);
    }

    function dropAll(): void {
        for (const id of [...pending.keys(), ...late.keys()]) {
            answer(id, undefined);
        }
    }

    link.listen({
        ready: () => {
            started = true;
            for (const [id, message] of [...starting]) {
                starting.delete(id);
                if (!link.send(message)) {
                    answer(id, undefined);
                }
            }
        },
        message: (message) => {
            if (isReply(message)) {
                answer(message.id, message);
            } else if (message.type === "error" && message.id !== undefined) {
                answer(message.id, undefined);
            }
        },
        down: dropAll,
    });

    function request(message: Request, options: RequestOptions): Promise<Reply | undefined> {
        const wait = options.waitForStart === true && !started && !link.ready();
        if (!wait && !link.send(message)) {
            return Promise.resolve(undefined);
        }
        return new Promise((resolve) => {
            const release = options.hold === false ? undefined : link.hold();
            const finish = (reply: Reply | undefined) => {
                pending.delete(message.id);
                starting.delete(message.id);
                clearTimeout(timer);
                release?.();
                resolve(reply);
            };
            const timer = setTimeout(() => {
                finish(undefined);
                if (options.late !== undefined) {
                    late.set(message.id, options.late);
                }
                if (late.size > MAX_LATE) {
                    answer(late.keys().next().value as string, undefined);
                }
            }, options.ms);
            timer.unref();
            pending.set(message.id, finish);
            if (wait) {
                starting.set(message.id, message);
            }
        });
    }

    return { request, stop: dropAll };
}
