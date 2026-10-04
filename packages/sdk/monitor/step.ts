import type { Scope } from "../context/scope.ts";
import type { ResponsesRequest } from "./request.ts";

// One model call the monitor is watching
export type Step = {
    scope: Scope;
    stepId: string;
    request: ResponsesRequest;
    started: number;
    version: string;
    // Hosted tool items already handled, by item id
    hosted: Set<string>;
};
