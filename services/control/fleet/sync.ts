import { quarantineList, type Db } from "@quard/db";
import type { QuarantineEntry } from "@quard/shared";
import { ignore } from "../common/ignore.ts";
import type { Connection, Registry } from "../socket/registry.ts";
import { send } from "../socket/send.ts";

export type FleetSync = {
    // Runs after the quarantine work already queued for the project
    inProject<T>(projectId: string, work: () => Promise<T>): Promise<T>;
    // Reloads the project's list and tells each SDK what changed
    refresh(projectId: string): Promise<void>;
    refreshAll(): Promise<void>;
};

// Sends one SDK the entries it does not have yet
export function tell(connection: Connection, entries: QuarantineEntry[]): void {
    const add = entries.filter((entry) => connection.known.get(entry.key) !== entry.observe);
    for (const entry of add) {
        connection.known.set(entry.key, entry.observe);
    }
    if (add.length > 0) {
        send(connection, { type: "quarantine", add, remove: [] });
    }
}

// Sends one SDK how its copy differs from the whole list
function replace(connection: Connection, list: QuarantineEntry[]): void {
    const next = new Map(list.map((entry) => [entry.key, entry.observe]));
    const add = list.filter((entry) => connection.known.get(entry.key) !== entry.observe);
    const remove = [...connection.known.keys()].filter((key) => !next.has(key));
    connection.known = next;
    if (add.length > 0 || remove.length > 0) {
        send(connection, { type: "quarantine", add, remove });
    }
}

// Quarantine work for one project takes turns, so a reload never undoes a newer push
export function createFleetSync(db: Db, registry: Registry): FleetSync {
    const turns = new Map<string, Promise<void>>();

    function inProject<T>(projectId: string, work: () => Promise<T>): Promise<T> {
        const run = (turns.get(projectId) ?? Promise.resolve()).then(work);
        turns.set(projectId, run.then(ignore, ignore));
        return run;
    }

    async function refresh(projectId: string): Promise<void> {
        await inProject(projectId, async () => {
            const connections = registry.inProject(projectId);
            if (connections.length === 0) {
                return;
            }
            const list = await quarantineList(db, projectId);
            for (const connection of connections) {
                replace(connection, list);
            }
        });
    }

    return {
        inProject,
        refresh,
        refreshAll: async () => {
            for (const projectId of registry.projects()) {
                await refresh(projectId);
            }
        },
    };
}
