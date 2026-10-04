import type { Job } from "../types.ts";
import { DIALOG, section } from "./shared.ts";

// Example 22: an orchestrator reads a poisoned page and the billing agent's payment is blocked
const RUN = "/runs/95e90d4aff22d7ca4a30efeaafa47d75";
// The blocked payInvoice call, and the action guard decision that blocked it
const STEP = "6fdcfe22c0522446";
const GUARD_STEP = "d1b555260525be56";

// Example 26, first run: the x402 guard only observes and the agent pays $0.01
const PAID_RUN = "/runs/02dfbd4d60969c201236b481791e6d14";

const TIMELINE = section("Timeline");
const PAYMENTS = section("Payments");
// The settled payment, after the price request
const PAID = `${PAYMENTS} tbody tr:nth-child(2)`;

// The runs list, a run, its payments, a step and a guard decision
export const RUNS_JOBS: Job[] = [
    {
        name: "runs-list",
        url: "/runs",
        marks: [
            { n: 1, sel: "main h1 span[title]" },
            { n: 2, sel: 'input[aria-label="Search runs"]', closest: "label" },
            { n: 3, sel: 'button[aria-label="Filter by agent"]' },
            { n: 4, sel: 'button[aria-label="Filter by status"]' },
            { n: 5, sel: 'ul[aria-label="Guard decision colors"]' },
            { n: 6, sel: 'button[aria-label="Refresh runs"]' },
            { n: 7, sel: "tbody tr", pad: 2 },
        ],
    },
    {
        name: "run",
        url: RUN,
        marks: [
            { n: 1, sel: "main h1", closest: "header" },
            { n: 2, sel: 'dl[aria-label="Run summary"]' },
            { n: 3, sel: `${TIMELINE} button[aria-pressed]` },
            { n: 4, sel: `${TIMELINE} span`, text: "Untrusted context", closest: "span.inline-flex" },
            { n: 5, sel: `${TIMELINE} svg[tabindex="0"]`, closest: ".w-max" },
            { n: 6, sel: `${TIMELINE} span`, text: "Legend:", closest: "div" },
            { n: 7, sel: section("Run graph") },
            { n: 8, sel: section("Run limits") },
        ],
        full: true,
    },
    {
        name: "run-payments",
        url: PAID_RUN,
        marks: [
            { n: 1, sel: `${PAYMENTS} h2` },
            { n: 2, sel: `${PAYMENTS} tbody tr`, pad: 2 },
            { n: 3, sel: `${PAID} td:nth-child(1)`, pad: 2, badge: "bl" },
            { n: 4, sel: `${PAID} td:nth-child(2)`, pad: 2, badge: "bl" },
            { n: 5, sel: `${PAID} td:nth-child(3)`, pad: 2, badge: "bl" },
            { n: 6, sel: `${PAID} td:nth-child(4)`, pad: 2, badge: "bl" },
            { n: 7, sel: `${PAID} td:nth-child(5)`, pad: 2, badge: "bl" },
            { n: 8, sel: `${PAID} td:nth-child(6)`, pad: 2, badge: "bl" },
        ],
        full: true,
        clip: { sel: PAYMENTS, pad: 24 },
    },
    {
        name: "run-step",
        url: `${RUN}?step=${STEP}`,
        marks: [
            { n: 1, sel: `${DIALOG} h2`, badge: "l" },
            { n: 2, sel: `${DIALOG} button`, text: "Copy", closest: "div", badge: "l" },
            { n: 3, sel: `${DIALOG} section`, badge: "l" },
            { n: 4, sel: `${DIALOG} h3`, text: "Arguments", closest: "section", badge: "l" },
        ],
        height: 1300,
    },
    {
        name: "run-step-guard",
        url: `${RUN}?step=${GUARD_STEP}`,
        marks: [
            { n: 1, sel: `${DIALOG} dt`, text: "Parent step", closest: "div", badge: "l" },
            { n: 2, sel: `${DIALOG} h3`, text: "Guard decision", closest: "section", badge: "l" },
        ],
        height: 1300,
    },
];
