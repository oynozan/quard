import { droppedEvents, listConfigErrors, type ConfigErrorSource } from "@quard/db";
import { windowsAt } from "./overview/windows";
import { projectScope } from "./scope";

// The overview lists a few, so they never push its tables far down
const ERRORS_SHOWN = 5;

export type ConfigError = { source: ConfigErrorSource; message: string; lastSeenAt: number; count: number };

// What SDKs reported about themselves: config that failed to load, and events they lost
export type SdkReports = { configErrors: ConfigError[]; dropped: { count: number; lastAt: number } | null };

// Config errors newest first, and drops over the overview's last 24 hours
export async function getSdkReports(now: number): Promise<SdkReports> {
    const scope = await projectScope();
    if (!scope) return { configErrors: [], dropped: null };
    const { db, project } = scope;
    const [errors, dropped] = await Promise.all([
        listConfigErrors(db, project.id, { limit: ERRORS_SHOWN }),
        droppedEvents(db, project.id, windowsAt(now).lastDay.since),
    ]);
    return {
        configErrors: errors.map(({ source, message, lastSeenAt, count }) => ({
            source,
            message,
            lastSeenAt: lastSeenAt.getTime(),
            count,
        })),
        // No time means nothing was dropped
        dropped: dropped.lastAt ? { count: dropped.count, lastAt: dropped.lastAt.getTime() } : null,
    };
}
