import type { Job } from "../types.ts";
import { AGENT_JOBS } from "./agents.ts";
import { APPROVAL_JOBS } from "./approvals.ts";
import { GETTING_STARTED_JOBS } from "./getting-started.ts";
import { INCIDENT_JOBS } from "./incidents.ts";
import { OVERVIEW_JOBS } from "./overview.ts";
import { RUNS_JOBS } from "./runs.ts";
import { SEARCH_JOBS } from "./search.ts";
import { SETTINGS_JOBS } from "./settings.ts";
import { SUMMARY_JOBS } from "./summary.ts";

// Every screenshot in the user guides, with its marks, in guide order. Each guide has its own file.
export const JOBS: Job[] = [
    ...GETTING_STARTED_JOBS,
    ...OVERVIEW_JOBS,
    ...RUNS_JOBS,
    ...APPROVAL_JOBS,
    ...INCIDENT_JOBS,
    ...AGENT_JOBS,
    ...SUMMARY_JOBS,
    ...SEARCH_JOBS,
    ...SETTINGS_JOBS,
];
