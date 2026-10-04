import type { Insertable } from "kysely";
import type { ChunkLabelsTable } from "../../schema/database.ts";
import type { RunItem } from "./rows.ts";

// One row per labeled chunk. A chunk labeled none waits for the AI fallback.
export function chunkRows(projectId: string, items: RunItem[]): Insertable<ChunkLabelsTable>[] {
    return items.flatMap(({ id, event }): Insertable<ChunkLabelsTable>[] =>
        event.type === "chunk_label"
            ? [
                  {
                      project_id: projectId,
                      event_id: id,
                      run_id: event.runId,
                      step_id: event.stepId,
                      agent: event.agent,
                      tool: event.tool,
                      origin: event.origin,
                      detector: event.detector,
                      chunk: event.chunk,
                      text: event.text,
                      label: event.label,
                      probabilities: JSON.stringify(event.probabilities),
                      confidence: event.probabilities[event.label] ?? 0,
                      score: event.score,
                      injection: event.injection ?? null,
                      at: event.at,
                      fallback_state: event.label === "none" ? "pending" : null,
                  },
              ]
            : [],
    );
}
