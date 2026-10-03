import { CHANNELS, type Notice } from "@quard/db";
import { createDelivery } from "../approvals/deliver.ts";
import type { Context } from "../server/context.ts";
import { every } from "./every.ts";
import { closeRevoked } from "./keys.ts";
import { keepListening, type OpenListener } from "./listen.ts";

export type Watcher = { stop(): Promise<void> };

const DECISIONS = "the decision check";
const QUARANTINE = "the quarantine refresh";
const KEYS = "the key check";

// Notifications make control quick, and the timers catch what they miss since PGlite never sends one
export function startWatcher(ctx: Context, url: string, open: OpenListener): Watcher {
    const delivery = createDelivery(ctx);
    const run = (name: string, task: Promise<void>) => {
        void task.catch((error: Error) => ctx.log(`control: ${name} failed: ${error.message}`));
    };

    function heard(notice: Notice): void {
        if (notice.channel === CHANNELS.approvals) {
            run(DECISIONS, delivery.heard(notice.payload));
        } else if (notice.channel === CHANNELS.fleet) {
            run(QUARANTINE, ctx.fleet.refresh(notice.payload));
        } else {
            const connected = ctx.registry.keyIds().filter((id) => id === notice.payload);
            run(KEYS, closeRevoked(ctx, connected));
        }
    }

    const timers = [
        every(ctx.timing.decisionMs, DECISIONS, delivery.check, ctx.log),
        every(ctx.timing.fleetMs, QUARANTINE, () => ctx.fleet.refreshAll(), ctx.log),
        every(ctx.timing.keyMs, KEYS, () => closeRevoked(ctx), ctx.log),
    ];
    const stopListening = keepListening({
        url,
        open,
        heard,
        back: () => {
            run(DECISIONS, delivery.check());
            run(QUARANTINE, ctx.fleet.refreshAll());
            run(KEYS, closeRevoked(ctx));
        },
        timing: ctx.timing,
        log: ctx.log,
    });

    return {
        stop: async () => {
            timers.forEach((stop) => stop());
            await stopListening();
        },
    };
}
