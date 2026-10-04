import { newPayees, quarantinedPayees, spendBy, spendByDay, type SpendGroup } from "@quard/db";
import { DAY } from "@/lib/time";
import { WINDOW_DAYS, windowStart } from "../fleet/blocks";
import { projectScope } from "../scope";
import type { SpendData, SpendItem } from "./types";

const itemOf = ({ key, usd, payments, unknown }: SpendGroup): SpendItem => ({ label: key, usd, payments, unknown });

// x402 spend over the last 30 UTC days, today included
export async function getSpend(): Promise<SpendData> {
    const scope = await projectScope();
    const endAt = Date.now();
    const startAt = windowStart(endAt);
    const byDay = Array.from({ length: WINDOW_DAYS }, () => 0);
    const empty: SpendData = {
        startAt,
        endAt,
        byDay,
        totalUsd: 0,
        payments: 0,
        unknown: 0,
        byAgent: [],
        byHost: [],
        byPayee: [],
        newPayees: [],
        quarantined: [],
    };
    if (!scope) return empty;
    const { db, project } = scope;
    const range = { since: new Date(startAt), until: new Date(startAt + WINDOW_DAYS * DAY) };
    const [days, agents, hosts, payees, fresh, held] = await Promise.all([
        spendByDay(db, project.id, range),
        spendBy(db, project.id, "agent", range),
        spendBy(db, project.id, "host", range),
        spendBy(db, project.id, "payTo", range),
        newPayees(db, project.id, range),
        quarantinedPayees(db, project.id),
    ]);
    for (const day of days) byDay[day.day] = day.usd;
    return {
        ...empty,
        totalUsd: days.reduce((sum, day) => sum + day.usd, 0),
        payments: days.reduce((sum, day) => sum + day.payments, 0),
        unknown: days.reduce((sum, day) => sum + day.unknown, 0),
        byAgent: agents.map(itemOf),
        byHost: hosts.map(itemOf),
        byPayee: payees.map(itemOf),
        newPayees: fresh.map((row) => ({ ...row, firstPaidAt: row.firstPaidAt.getTime() })),
        quarantined: held.map((row) => ({
            address: row.address,
            quarantinedAt: row.quarantinedAt.getTime(),
            observe: row.observe,
            runs: row.runs,
            blockedAttempts: row.blockedAttempts,
            usd: row.usd,
            payments: row.payments,
        })),
    };
}
