import type { Db } from "@quard/db";
import type { ProjectKeys } from "@quard/db/server";
import { createFleetSync, type FleetSync } from "../fleet/sync.ts";
import { createRegistry, type Registry } from "../socket/registry.ts";
import { CONTROL_TIMING, type ControlTiming } from "./timing.ts";

// What every handler in control works with
export type Context = {
    db: Db;
    // Each project's hash key and redactor, never the install's
    keys: ProjectKeys;
    registry: Registry;
    fleet: FleetSync;
    timing: ControlTiming;
    now(): Date;
    log(message: string): void;
};

export type ContextOptions = {
    db: Db;
    keys: ProjectKeys;
    timing?: Partial<ControlTiming>;
    now?: () => Date;
    log?: (message: string) => void;
};

export function createContext(options: ContextOptions): Context {
    const now = options.now ?? (() => new Date());
    const registry = createRegistry(() => now().getTime());
    return {
        db: options.db,
        keys: options.keys,
        registry,
        fleet: createFleetSync(options.db, registry),
        timing: { ...CONTROL_TIMING, ...options.timing },
        now,
        log: options.log ?? console.error,
    };
}
