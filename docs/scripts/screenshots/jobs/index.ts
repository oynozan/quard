import type { Job } from "../types.ts";
import { PAGE_JOBS } from "./pages.ts";
import { SETTINGS_JOBS } from "./settings.ts";
import { SUMMARY_JOBS } from "./summary.ts";

// Every screenshot in the user guides, with its marks
export const JOBS: Job[] = [...PAGE_JOBS, ...SUMMARY_JOBS, ...SETTINGS_JOBS];
