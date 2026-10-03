import type { QuarantineEntry, Redactor } from "@quard/shared";
import type { FleetView } from "../../guards/limit/fleet.ts";
import type { Link } from "./link.ts";

function timeOf(at: string | null): number | null {
    return at === null ? null : Date.parse(at);
}

// The synced quarantine list, used for staleMs after control was last reached
export function createFleetState(link: Link, redactor: Redactor, staleMs: number): FleetView {
    const list = new Map<string, QuarantineEntry>();
    let observeUntil: number | null = null;
    let syncedAt = Date.now();

    const add = (entries: readonly QuarantineEntry[]) => {
        for (const entry of entries) {
            list.set(entry.key, entry);
        }
    };

    link.listen({
        ready: (message) => {
            list.clear();
            add(message.quarantine);
            observeUntil = timeOf(message.fleetObserveUntil);
        },
        message: (message) => {
            if (message.type === "quarantine") {
                add(message.add);
                message.remove.forEach((key) => list.delete(key));
            } else if (message.type === "fleet_result") {
                add(message.quarantined);
                observeUntil = timeOf(message.fleetObserveUntil);
            }
        },
        down: () => {
            syncedAt = Date.now();
        },
    });

    return {
        redactor,
        entry: (key, now) => {
            if (!link.ready() && now - syncedAt > staleMs) {
                list.clear();
            }
            return list.get(key);
        },
        pastObserve: (now) => observeUntil === null || now > observeUntil,
    };
}
