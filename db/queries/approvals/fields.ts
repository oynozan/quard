import type { ArgumentLabelMessage, AskReason } from "@quard/shared";
import type { ApprovalContext } from "./types.ts";

// Columns every request listing reads
export const REQUEST_FIELDS = [
    "id",
    "run_id as runId",
    "step_id as stepId",
    "agent",
    "tool",
    "args_hash as argsHash",
    "masked",
    "labels",
    "context",
    "reasons",
    "rules_hash as rulesHash",
    "opened_at as openedAt",
] as const;

// jsonb comes back untyped. Control checked these shapes before storing them.
export type JsonFields = { labels: ArgumentLabelMessage[]; context: ApprovalContext; reasons: AskReason[] };
