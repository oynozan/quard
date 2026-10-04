import type { Job } from "../types.ts";
import { section } from "./shared.ts";

const HERO = section("Model calls in the last 24 hours");
const RAIL = 'aside[aria-label="Fleet summary"]';

// The overview page
export const OVERVIEW_JOBS: Job[] = [
    {
        name: "overview-top",
        url: "/",
        marks: [
            { n: 1, sel: `${HERO} h1` },
            { n: 2, sel: `${HERO} button[aria-pressed]`, closest: "div", badge: "tr" },
            { n: 3, sel: `${HERO} svg[role="img"]`, pad: 6 },
            { n: 4, sel: section("Runs"), pad: 2 },
            { n: 5, sel: section("Guarded tools"), pad: 2 },
            { n: 6, sel: section("Block rate"), pad: 2 },
            { n: 7, sel: section("Guard decisions"), pad: 2 },
        ],
    },
    {
        name: "overview-lists",
        url: "/",
        marks: [
            { n: 1, sel: section("Approvals waiting"), pad: 8 },
            { n: 2, sel: section("Recent runs"), pad: 8 },
            { n: 3, sel: section("Incidents"), pad: 8 },
            { n: 4, sel: section("Decision log"), pad: 8 },
            { n: 5, sel: `${RAIL} section`, pad: 2 },
            { n: 6, sel: `${RAIL} section`, nth: 1, pad: 2 },
        ],
        full: true,
        clip: { sel: section("Approvals waiting"), closest: 'div[class*="268px"]', pad: 28 },
    },
];
