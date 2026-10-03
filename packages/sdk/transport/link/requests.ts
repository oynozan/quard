import type { CountMessage, FleetMessage, ServerMessage } from "@quard/shared";
import type { Link } from "./link.ts";

export type Reply = Extract<ServerMessage, { type: "counted" | "fleet_result" }>;

export type RequestOptions = {
    ms: number;
    // False for messages nothing waits on, so they never keep the process alive
    hold?: boolean;
    // Gets a reply that came after the wait, or undefined once none can come
    late?: (reply: Reply | undefined) => void;
};

export type Requests = {
    // The reply, or undefined when control could not answer in time
    request(message: CountMessage | FleetMessage, options: RequestOptions): Promise<Reply | undefined>;
    stop(): void;
};

const MAX_LATE = 1000;

// Matches control's answers to the counts and fleet reports sent, by id
export function createRequests(link: Link): Requests {
    const pending = new Map<string, (reply: Reply | undefined) => void>();
    const late = new Map<string, (reply: Reply | undefined) => void>();

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
        message: (message) => {
            if (message.type === "counted" || message.type === "fleet_result") {
                answer(message.id, message);
            } else if (message.type === "error" && message.id !== undefined) {
                answer(message.id, undefined);
            }
        },
        down: dropAll,
    });

    function request(message: CountMessage | FleetMessage, options: RequestOptions): Promise<Reply | undefined> {
        if (!link.send(message)) {
            return Promise.resolve(undefined);
        }
        return new Promise((resolve) => {
            const release = options.hold === false ? undefined : link.hold();
            const finish = (reply: Reply | undefined) => {
                pending.delete(message.id);
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
        });
    }

    return { request, stop: dropAll };
}
