import type { Job } from "../types.ts";
import { DIALOG, section } from "./shared.ts";

const KEYS = section("Agent keys");
const RULES = section("Rules");

// The settings tabs
export const SETTINGS_JOBS: Job[] = [
    {
        name: "settings-keys",
        url: "/settings",
        marks: [
            { n: 1, sel: '[role="tablist"][aria-label="Settings sections"]' },
            { n: 2, sel: `${KEYS} button`, text: "Create key" },
            { n: 3, sel: `${KEYS} tbody tr`, pad: 2 },
            { n: 4, sel: 'button[aria-label^="Revoke key"]' },
        ],
    },
    {
        name: "settings-create-key",
        url: "/settings",
        actions: [{ click: { sel: `${KEYS} button`, text: "Create key" }, wait: 1200 }],
        marks: [
            { n: 1, sel: `${DIALOG} button[aria-label="Close"]`, badge: "l" },
            { n: 2, sel: `${DIALOG} input#key-name`, badge: "l" },
            { n: 3, sel: `${DIALOG} button[type="submit"]`, text: "Create key", badge: "l" },
            { n: 4, sel: `${DIALOG} button`, text: "Cancel", badge: "l" },
        ],
    },
    {
        name: "settings-accounts",
        url: "/settings?tab=accounts",
        marks: [{ n: 1, sel: "main h3", text: "No accounts to manage", closest: "div" }],
    },
    {
        name: "settings-retention",
        url: "/settings?tab=retention",
        marks: [
            { n: 1, sel: `${section("Retention")} table` },
            { n: 2, sel: "main h2", text: "Redaction", closest: "div:has(> dl)" },
        ],
        full: true,
    },
    {
        name: "settings-code",
        url: "/settings?tab=code",
        marks: [
            { n: 1, sel: section("Connected apps") },
            // The toolbar that holds the rule search and both filters
            { n: 2, sel: 'input[aria-label="Search rules"]', closest: "div" },
            { n: 3, sel: `${RULES} table` },
            { n: 4, sel: section("Origin overrides") },
            { n: 5, sel: "main button", text: "Show example" },
        ],
        full: true,
    },
];
