import type { Job } from "../types.ts";
import { section } from "./shared.ts";

// A real incident from sandbox/15-everything.ts: an IBAN from an email,
// paid because the fleet check only observes
const INCIDENT = "/incidents/inc_197448ada4f697ad";

// The incidents list and an incident
export const INCIDENT_JOBS: Job[] = [
    {
        name: "incidents-list",
        url: "/incidents",
        marks: [
            { n: 1, sel: 'input[aria-label="Search incidents"]', closest: "label" },
            { n: 2, sel: 'main [role="combobox"][aria-label="Category"]' },
            { n: 3, sel: 'main [role="combobox"][aria-label="Replay status"]' },
            { n: 4, sel: `${section("Incident list")} p[role="status"]` },
            { n: 5, sel: `${section("Incident list")} tbody tr`, pad: 2 },
        ],
    },
    {
        name: "incident",
        url: INCIDENT,
        marks: [
            { n: 1, sel: "main h1" },
            { n: 2, sel: "main p", text: "Opened" },
            { n: 3, sel: "main a", text: "Open run" },
            { n: 4, sel: 'main button[aria-label="Replay"]' },
            { n: 5, sel: section("Path from entry point to damage") },
            { n: 6, sel: section("Replay results") },
            { n: 7, sel: section("Verdict") },
        ],
        full: true,
    },
];
