import type { Job } from "../types.ts";
import { section } from "./shared.ts";

const GRAPH = section("Agent graph");
const CALLS = section("Recent calls");

// The agents page, an agent and its recent calls
export const AGENT_JOBS: Job[] = [
    {
        name: "agents",
        url: "/agents",
        marks: [
            { n: 1, sel: `${GRAPH} div`, text: "Messages" },
            { n: 2, sel: `${GRAPH} button`, text: "Table" },
            { n: 3, sel: `${GRAPH} a[aria-label^="billing,"]` },
            { n: 4, sel: `${GRAPH} div`, text: "10–59%" },
            { n: 5, sel: section("Agents") },
        ],
        full: true,
    },
    {
        name: "agent",
        url: "/agents/billing",
        marks: [
            { n: 1, sel: "main h1", closest: "header" },
            { n: 2, text: "View runs", closest: "a" },
            { n: 3, sel: section("Last 24 hours") },
            { n: 4, sel: CALLS },
            { n: 5, sel: section("Versions") },
            { n: 6, sel: section("Incidents") },
            { n: 7, sel: section("Permissions") },
            { n: 8, sel: section("Model calls per hour") },
        ],
        full: true,
    },
    {
        name: "agent-calls",
        url: "/agents/billing",
        clip: { sel: CALLS },
        marks: [
            { n: 1, sel: `${CALLS} div`, text: "Untrusted context" },
            { n: 2, sel: `${CALLS} li`, text: "Tool calls", closest: "ul", badge: "l" },
            { n: 3, sel: `${CALLS} [role="img"]` },
            { n: 4, sel: `${CALLS} div`, text: "Untrusted internal" },
        ],
    },
];
