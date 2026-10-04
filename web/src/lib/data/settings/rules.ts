import type { ConnectedAppRow, RuleSetRow } from "@quard/db";
import type { GuardType } from "../types";
import type { RuleRow } from "./types";

// A guard this dashboard cannot name is left out
const GUARDS: ReadonlySet<string> = new Set<GuardType>([
    "source",
    "action",
    "approval",
    "egress",
    "limit",
    "permission",
]);

// The SDK lists run limits under this tool, for the whole run
const WHOLE_RUN = "*";

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function byName(a: RuleRow, b: RuleRow): number {
    return (
        order(a.name, b.name) ||
        order(a.guard, b.guard) ||
        order(String(a.mode), String(b.mode)) ||
        order(a.hash, b.hash)
    );
}

// The SDK sends one entry per tool, so each rule of a set becomes one row with every tool it guards
export function rulesOf(sets: RuleSetRow[], apps: ConnectedAppRow[]): RuleRow[] {
    const rows = new Map<string, RuleRow>();
    for (const set of sets) {
        const running = apps.filter((app) => app.rulesHashes.includes(set.hash)).map((app) => app.name);
        const names = [...new Set(running)].sort(order);
        for (const entry of set.rules) {
            if (!GUARDS.has(entry.guard)) continue;
            const guard = entry.guard as GuardType;
            // Approval guards always ask, so they have no mode
            const mode = guard === "approval" ? null : entry.mode;
            const id = `${set.hash} ${guard} ${entry.rule} ${mode}`;
            const row = rows.get(id);
            // No tools reads as the whole run
            const tools = entry.tool === WHOLE_RUN ? [] : [entry.tool];
            if (!row) {
                rows.set(id, {
                    name: entry.rule,
                    guard,
                    tools,
                    apps: names,
                    mode,
                    hash: set.hash,
                    summary: "",
                    source: "team",
                });
            } else {
                row.tools.push(...tools.filter((tool) => !row.tools.includes(tool)));
            }
        }
    }
    return [...rows.values()].sort(byName);
}
