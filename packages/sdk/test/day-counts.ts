import { parseHashKey } from "@quard/shared";
import { vi } from "vitest";
import type { LimitOptions } from "../guards/options.ts";
import { createControl } from "../transport/link/control.ts";
import { fakeSockets, sentOf, type FakeSocket } from "./fake-socket.ts";

export const CALLS: LimitOptions = { type: "limit", maxCallsPerDay: 1 };
export const AMOUNT: LimitOptions = { type: "limit", maxAmountPerDay: { field: "amount", max: 100 } };

// A control link over sockets the test connects by hand
export function dayControl() {
    const fake = fakeSockets();
    const control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    return { fake, control };
}

// Each per-day count a socket sent, with its tool and day
export function sentDays(socket: FakeSocket) {
    return sentOf(socket, "count").flatMap(({ tool, day, counts }) => counts.map((count) => ({ tool, day, ...count })));
}

// Each per-day count a socket took back, with its tool and day
export function takenDays(socket: FakeSocket) {
    return sentOf(socket, "uncount").flatMap(({ tool, day, counts }) =>
        counts.map((count) => ({ tool, day, ...count })),
    );
}

export function counted(id: string | undefined, ok: boolean, used: number[]) {
    return { type: "counted", id: id as string, ok, used } as const;
}

// Drops the link and reconnects, which sends what was kept
export async function reconnect(fake: ReturnType<typeof fakeSockets>): Promise<FakeSocket> {
    fake.last().drop();
    await vi.advanceTimersByTimeAsync(0);
    vi.advanceTimersByTime(1000);
    return fake.connect();
}
