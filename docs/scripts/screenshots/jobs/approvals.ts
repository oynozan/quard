import type { Job } from "../types.ts";
import { section } from "./shared.ts";

const GRANTS = section("Always approve grants");
const DECIDED = section("Decided");

// The first waiting request, its deny confirm, grants and past answers
export const APPROVAL_JOBS: Job[] = [
    {
        name: "approval-request",
        url: "/approvals",
        marks: [
            { n: 1, sel: "article h3", closest: "div" },
            { n: 2, sel: 'article a[aria-label^="Open run "]', closest: "p" },
            { n: 3, sel: "article h3", text: "Arguments", closest: "div" },
            { n: 4, sel: "article h3", text: "Checks", closest: "div" },
            { n: 5, sel: "article h3", text: "Influence path", closest: "div" },
            { n: 6, sel: "article footer button", text: "Approve once" },
            { n: 7, sel: "article footer button", text: "Always approve" },
            { n: 8, sel: "article footer button", text: "Deny" },
        ],
        full: true,
        clip: { sel: "article", pad: 14 },
    },
    {
        // Opens the confirm only. "Deny call" is never clicked.
        name: "approval-deny",
        url: "/approvals",
        actions: [{ click: { sel: "article footer button", text: "Deny" }, wait: 900 }],
        marks: [
            { n: 1, sel: "article footer div", text: "cannot be undone" },
            { n: 2, sel: "article footer button", text: "Deny call" },
            { n: 3, sel: "article footer button", text: "Cancel" },
        ],
        clip: { sel: "article footer", pad: 20 },
    },
    {
        name: "approval-grants",
        url: "/approvals",
        marks: [
            { n: 1, sel: `${GRANTS} [role="group"][aria-label="Show grants"]` },
            { n: 2, sel: `${GRANTS} tbody tr`, pad: 2 },
            { n: 3, sel: `${GRANTS} tbody button[aria-label^="Revoke "]` },
        ],
        full: true,
        clip: { sel: GRANTS, pad: 24 },
    },
    {
        name: "approval-decisions",
        url: "/approvals",
        marks: [
            { n: 1, sel: `${DECIDED} [role="group"][aria-label="Show decisions"]` },
            { n: 2, sel: `${DECIDED} tbody tr`, pad: 2 },
        ],
        full: true,
        clip: { sel: DECIDED, pad: 24 },
    },
];
