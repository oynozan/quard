import { catalogRows } from "./runs/catalog";
import type { RunSummary } from "./types";

// The 60 most recent runs, newest first.
export function recentRuns(): RunSummary[] {
    return catalogRows().slice(0, 60);
}

export { listRuns, getRun } from "./runs/query";
export { STORY_RUN_ID } from "./runs/scripts/story";
export type {
    AgentLink,
    ApprovalInfo,
    ApprovalState,
    Channel,
    GuardDecision,
    LinkKind,
    MemoryAccess,
    ModelUsage,
    RunAgent,
    RunDetail,
    RunEdge,
    RunGraph,
    RunLimitUse,
    RunQuery,
    RunRow,
    SourceScan,
    Step,
    StepArg,
    StepStatus,
} from "./runs/types";
