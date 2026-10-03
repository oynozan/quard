import type { Job } from "../types.ts";
import { DIALOG, NAV, RUN, section, STEP } from "./shared.ts";

// Sign-in, overview, runs, approvals, incidents and agents
export const PAGE_JOBS: Job[] = [
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
            { n: 1, sel: 'nav[aria-label="Main"]', badge: "tr" },
            { n: 2, sel: `${NAV} a`, text: "Settings", badge: "tr" },
            { n: 3, sel: `${NAV} a[href="/approvals"]`, nth: 1, badge: "tr", pad: 6 },
            { n: 4, sel: `${NAV} a[href="/settings"]`, nth: 1, badge: "tr", pad: -4 },
            { n: 5, sel: 'button[aria-label="Sign out"]', badge: "r" },
        ],
    },
    {
        name: "overview-top",
        url: "/",
        marks: [
            { n: 1, sel: section("Model calls in the last 24 hours") },
            { n: 2, sel: section("Runs"), pad: 2 },
            { n: 3, sel: section("Guarded tools"), pad: 2 },
            { n: 4, sel: section("Block rate"), pad: 2 },
            { n: 5, sel: section("Guard decisions"), pad: 2 },
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
            { n: 5, sel: 'aside[aria-label="Fleet summary"]', pad: 8 },
        ],
        full: true,
        clip: { sel: section("Approvals waiting"), closest: 'div[class*="268px"]', pad: 28 },
    },
    {
        name: "runs-list",
        url: "/runs",
        marks: [
            { n: 1, sel: "main input", closest: "label" },
            { n: 2, sel: 'button[aria-label="Filter by agent"]' },
            { n: 3, sel: 'button[aria-label="Filter by status"]' },
            { n: 4, sel: 'ul[aria-label="Guard decision colors"]' },
            { n: 5, sel: "tbody tr", pad: 2 },
        ],
    },
    {
        name: "run",
        url: RUN,
        marks: [
            { n: 1, sel: "main h1", closest: "header" },
            { n: 2, sel: 'dl[aria-label="Run summary"]' },
            { n: 3, sel: section("Timeline") },
            { n: 4, sel: section("Run graph") },
            { n: 5, sel: section("Run limits") },
        ],
        full: true,
    },
    {
        name: "run-step",
        url: `${RUN}?step=${STEP}`,
        marks: [
            { n: 1, sel: `${DIALOG} h2`, badge: "l" },
            { n: 2, sel: `${DIALOG} section`, badge: "l" },
            { n: 3, sel: `${DIALOG} section`, nth: 1, badge: "l" },
        ],
        height: 1300,
    },
    {
        name: "approval-request",
        url: "/approvals",
        marks: [
            { n: 1, sel: "article h3", closest: "div" },
            { n: 2, sel: "article h3", text: "Arguments", closest: "div" },
            { n: 3, sel: "article h3", text: "Checks", closest: "div" },
            { n: 4, text: "Also covers", closest: "p" },
            { n: 5, sel: "article h3", text: "Influence path", closest: "div" },
            { n: 6, sel: "article footer div" },
        ],
        clip: { sel: "article", pad: 10 },
    },
    {
        name: "approval-deny",
        url: "/approvals",
        actions: [{ click: { sel: "article footer button", text: "Deny" }, wait: 900 }],
        marks: [
            { n: 1, text: "cannot be undone" },
            { n: 2, sel: "button", text: "Deny call" },
            { n: 3, sel: "button", text: "Cancel" },
        ],
        clip: { sel: "article footer", pad: 20 },
    },
    {
        name: "approval-grants",
        url: "/approvals",
        marks: [
            { n: 1, sel: `${section("Always approve grants")} button`, text: "Active", closest: "div" },
            { n: 2, sel: `${section("Always approve grants")} tbody tr`, pad: 2 },
            { n: 3, sel: `${section("Always approve grants")} tbody button`, text: "Revoke" },
        ],
        full: true,
        clip: { sel: section("Always approve grants"), pad: 24 },
    },
    {
        name: "incidents-list",
        url: "/incidents",
        marks: [
            { n: 1, sel: "main input", closest: "label" },
            { n: 2, sel: "main button", text: "All categories" },
            { n: 3, sel: "main button", text: "Any replay" },
            { n: 4, sel: "tbody tr", pad: 2 },
        ],
    },
    {
        name: "incident",
        url: "/incidents/inc_118",
        marks: [
            { n: 1, sel: "main h1" },
            { n: 2, sel: section("Path from entry point to damage") },
            { n: 3, sel: section("Replay results") },
            { n: 4, sel: section("Verdict") },
            { n: 5, sel: section("AI reviewer") },
        ],
        full: true,
    },
    {
        name: "agents",
        url: "/agents",
        marks: [
            { n: 1, sel: section("Agent graph") },
            { n: 2, sel: `${section("Agent graph")} button`, text: "Table" },
            { n: 3, sel: section("Agents") },
        ],
    },
    {
        name: "agent",
        url: "/agents/billing",
        marks: [
            { n: 1, sel: "main h1", closest: "header" },
            { n: 2, text: "View runs", closest: "a" },
            { n: 3, sel: section("Recent calls") },
            { n: 4, sel: section("Versions") },
            { n: 5, sel: section("Incidents") },
            { n: 6, sel: section("Permissions") },
            { n: 7, sel: section("Model calls per hour") },
        ],
        full: true,
    },
];
