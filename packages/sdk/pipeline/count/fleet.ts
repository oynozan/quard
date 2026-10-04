import { newEventId } from "@quard/shared";
import type { FailResult, GuardCall, Mode, RuleResult } from "../../guards/call.ts";
import { fleetChunks, fleetMatch, fleetValues } from "../../guards/limit/fleet.ts";
import type { GuardOptions, LimitOptions } from "../../guards/options.ts";
import { activeControl } from "../../transport/link/active.ts";
import type { Control } from "../../transport/link/control.ts";
import type { FleetUse } from "../../transport/link/queue.ts";
import { recordDecision } from "../checks.ts";

// Sends one report and finds its quarantined values, or keeps it when control can't answer
export async function reportChunk(control: Control, use: FleetUse, mode: Mode): Promise<FailResult | undefined> {
    let kept = false;
    const reply = await control.requests.request(
        { type: "fleet", id: newEventId(), ...use },
        {
            ms: control.replyMs,
            late: (late) => {
                // Control has the report after all
                if (kept && late !== undefined) {
                    control.replays.dropUse(use);
                }
            },
        },
    );
    if (reply?.type !== "fleet_result") {
        control.replays.keepUse(use);
        kept = true;
        return undefined;
    }
    const until = reply.fleetObserveUntil === null ? null : Date.parse(reply.fleetObserveUntil);
    const pastObserve = until === null || Date.now() > until;
    const quarantined = new Map(reply.quarantined.map((entry) => [entry.key, entry]));
    return fleetMatch(use.values, mode, pastObserve, (key) => quarantined.get(key));
}

// Reports the watched values of a call about to run, and refuses newly quarantined ones
export async function reportUse(
    call: GuardCall,
    options: LimitOptions,
    control: Control | undefined,
    checked: readonly RuleResult[],
): Promise<FailResult | undefined> {
    if (options.fleetCheck === undefined || control === undefined) {
        return undefined;
    }
    const values = fleetValues(call.input, options.fleetCheck, control.fleet.redactor);
    const uses = fleetChunks(values).map((chunk) => ({
        runId: call.runId,
        agent: call.agent,
        tool: call.tool,
        blocked: false,
        values: chunk,
    }));
    if (!control.link.ready()) {
        uses.forEach((use) => control.replays.keepUse(use));
        return undefined;
    }
    const mode = options.mode ?? "block";
    const found = await Promise.all(uses.map((use) => reportChunk(control, use, mode)));
    const result = found.find((item) => item?.mode === "block") ?? found.find((item) => item !== undefined);
    if (result === undefined) {
        return undefined;
    }
    const flagged = checked.some((done) => done.rule === "fleet-check" && done.decision !== "allow");
    if (result.mode === "block" || !flagged) {
        recordDecision(call, result);
    }
    return result.mode === "block" ? result : undefined;
}

// A refused call still counts as a use of its watched values
export function reportRefused(call: GuardCall, list: readonly GuardOptions[]): void {
    const control = activeControl();
    const fields = [
        ...new Set(list.flatMap((options) => (options.type === "limit" ? (options.fleetCheck ?? []) : []))),
    ];
    if (control === undefined || fields.length === 0) {
        return;
    }
    for (const values of fleetChunks(fleetValues(call.input, fields, control.fleet.redactor))) {
        control.replays.use({ runId: call.runId, agent: call.agent, tool: call.tool, blocked: true, values });
    }
}
