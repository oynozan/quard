import type { MemoryEvent } from "@quard/shared";
import { now, record } from "../core/recorder.ts";
import type { Scope } from "../context/scope.ts";

export type MemoryFields = Pick<MemoryEvent, "store" | "op" | "items" | "verified" | "trust" | "sensitivity">;

// Records one read or write through quard.memory()
export function recordMemory(scope: Scope, stepId: string, fields: MemoryFields): void {
    record({ type: "memory", runId: scope.run.runId, stepId, agent: scope.agent, at: now(), ...fields });
}
