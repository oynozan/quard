import { openListener, type Listener } from "@quard/db";
import type { TestDb } from "@quard/db/testing";
import { expect } from "vitest";
import { startControl, type ControlServer, type StartOptions } from "../server/start.ts";
import type { ControlTiming } from "../server/timing.ts";
import { KEYS } from "./messages.ts";

// Short times, so a test never waits long on the timers
export const FAST: Partial<ControlTiming> = {
    decisionMs: 20,
    fleetMs: 50,
    keyMs: 50,
    relistenMs: 20,
    relistenMaxMs: 100,
    closeMs: 300,
};

// Long enough that a timer never runs during a test
export const NEVER = 3_600_000;

export type TestControl = ControlServer & { logs: string[]; listeners: Listener[] };

// Control on a free port and the test database, keeping each LISTEN connection for fake notifications
export async function startTestControl(test: TestDb, options: Partial<StartOptions> = {}): Promise<TestControl> {
    const logs: string[] = [];
    const listeners: Listener[] = [];
    const control = await startControl({
        db: test.db,
        databaseUrl: test.url,
        keys: KEYS,
        port: 0,
        log: (message) => logs.push(message),
        listen: async (url, heard, lost) => {
            const listener = await openListener(url, heard, lost);
            listeners.push(listener);
            return listener;
        },
        ...options,
        timing: { ...FAST, ...options.timing },
    });
    return Object.assign(control, { logs, listeners });
}

// The one item of a list, failing the test when there are more or none
export function only<T>(items: T[]): T {
    expect(items).toHaveLength(1);
    return items[0] as T;
}

// Waits until the condition holds, checking every few milliseconds
export async function until(condition: () => boolean | Promise<boolean>, ms = 3_000): Promise<void> {
    const end = Date.now() + ms;
    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error("the condition never held");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
