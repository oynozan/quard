import type { Job } from "../types.ts";
import { NAV, section } from "./shared.ts";

// A chart pane that is on every agent page
const PANE = section("Model calls per hour");

// Sign-in, the dashboard frame and a chart pane for the common controls
export const GETTING_STARTED_JOBS: Job[] = [
    {
        name: "sign-in",
        url: "/sign-in",
        marks: [
            { n: 1, sel: "button", text: "Continue with GitHub" },
            { n: 2, sel: "form input" },
            { n: 3, sel: "button", text: "Email me a code" },
        ],
        clip: { sel: "form", closest: 'div[class*="max-w-[520px]"]', pad: 48 },
    },
    {
        name: "shell",
        url: "/",
        marks: [
            { n: 1, sel: `${NAV} a[aria-label="Quard overview"]`, badge: "r" },
            { n: 2, sel: 'nav[aria-label="Main"]', badge: "tr" },
            { n: 3, sel: 'nav[aria-label="Workspace"] a[href="/settings"]', badge: "tr" },
            { n: 4, sel: `${NAV} a[href="/approvals"]`, nth: 1, badge: "tr", pad: 6 },
            { n: 5, sel: `${NAV} a[href="/settings"]`, nth: 1, badge: "tr", pad: -4 },
            { n: 6, sel: 'button[aria-label="Sign out"]', badge: "r" },
        ],
    },
    {
        name: "chart-pane",
        url: "/agents/billing",
        marks: [
            { n: 1, sel: `${PANE} h2`, badge: "l" },
            { n: 2, sel: `${PANE} header span`, text: "24H" },
            { n: 3, sel: `${PANE} button[aria-pressed]`, badge: "tr" },
            { n: 4, sel: `${PANE} span`, text: "Total", closest: 'span[class*="items-baseline"]' },
            { n: 5, sel: `${PANE} svg[role="img"]`, badge: "tr" },
        ],
        clip: { sel: PANE, pad: 32 },
    },
];
