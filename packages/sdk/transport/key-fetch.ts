import { HASH_KEY_PATH, hashKeyReply, type Redactor } from "@quard/shared";
import { learnProjectKey, projectRedactor } from "../core/project-key.ts";
import { worthRetrying, type Send } from "./uploader.ts";

export type KeyFetchOptions = {
    webhookUrl: string;
    key: string;
    send?: Send;
    warn?: (message: string) => void;
    timeoutMs?: number;
};

export type KeyFetch = {
    // Redacts with the project's key, first asking webhook for it while it
    // is unknown. Undefined when webhook can't hand it out now.
    redactor(): Promise<Redactor | undefined>;
    // Hands out nothing from then on, and ignores an answer still on its way:
    // it may be for an old agent key
    stop(): void;
};

// How long webhook may take to hand out the key
export const KEY_FETCH_MS = 5_000;

// Gets the project's hash key from webhook with the agent key
export function createKeyFetch(options: KeyFetchOptions): KeyFetch {
    const send = options.send ?? fetch;
    const warn = options.warn ?? console.warn;
    const url = `${options.webhookUrl.replace(/\/+$/, "")}${HASH_KEY_PATH}`;
    const warned = new Set<number>();
    let asking: Promise<Redactor | undefined> | undefined;
    let stopped = false;

    async function ask(): Promise<Redactor | undefined> {
        try {
            const res = await send(url, {
                method: "GET",
                headers: { authorization: `Bearer ${options.key}` },
                signal: AbortSignal.timeout(options.timeoutMs ?? KEY_FETCH_MS),
            });
            if (res.ok) {
                const reply = hashKeyReply.safeParse(await res.json());
                if (reply.success && !stopped) {
                    learnProjectKey(reply.data.hashKey);
                }
            } else if (!worthRetrying(res.status) && !warned.has(res.status)) {
                warned.add(res.status);
                warn(
                    `Quard: webhook refused to hand out the hash key (${res.status}). Check the agent key and the webhook URL.`,
                );
            }
        } catch {
            // Webhook can't be reached now, so the next call asks again
        }
        return stopped ? undefined : projectRedactor();
    }

    return {
        redactor: () => {
            if (stopped) {
                return Promise.resolve(undefined);
            }
            const known = projectRedactor();
            if (known !== undefined) {
                return Promise.resolve(known);
            }
            asking ??= ask().finally(() => {
                asking = undefined;
            });
            return asking;
        },
        stop: () => {
            stopped = true;
        },
    };
}
