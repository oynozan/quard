import type { Job } from "../types.ts";
import { DIALOG, section } from "./shared.ts";

// Search and settings
export const SETTINGS_JOBS: Job[] = searchAndSettingsJobs();

function searchAndSettingsJobs(): Job[] {
    const rules = section("Rules");
    const overrides = section("Origin overrides");
    return [
        {
            name: "search",
            url: "/search",
            marks: [
                { n: 1, sel: "main input" },
                { n: 2, sel: "main button", text: "Search" },
            ],
        },
        {
            name: "search-results",
            url: "/search?q=DE89370400440532013000",
            marks: [
                { n: 1, sel: "main h2" },
                { n: 2, text: "by hash" },
                { n: 3, text: "Run 4bf92f35", closest: "tr", pad: 2 },
                { n: 4, sel: "tbody tr", text: "pay_invoice", pad: 2 },
                { n: 5, text: "web:supplier-portal", closest: "[title]" },
            ],
            height: 1000,
        },
        {
            name: "settings-keys",
            url: "/settings",
            marks: [
                { n: 1, sel: '[role="tablist"]' },
                { n: 2, sel: "main button", text: "Create key" },
                { n: 3, sel: "tbody tr", pad: 2 },
                { n: 4, sel: "main button", text: "Revoke" },
                { n: 5, sel: "tbody tr", text: "Revoked", pad: 2 },
            ],
        },
        {
            name: "settings-create-key",
            url: "/settings",
            actions: [{ click: { sel: "main button", text: "Create key" }, wait: 1200 }],
            marks: [
                { n: 1, sel: `${DIALOG} input`, badge: "l" },
                { n: 2, sel: `${DIALOG} button`, text: "Create key", badge: "l" },
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
                { n: 1, sel: "main table" },
                { n: 2, sel: "main h2, main h3", text: "Redaction", closest: "div:has(> dl)" },
            ],
            full: true,
        },
        {
            name: "settings-code",
            url: "/settings?tab=code",
            marks: [
                { n: 1, sel: section("Connected apps") },
                { n: 2, sel: rules },
            ],
            height: 1100,
        },
        {
            name: "settings-overrides",
            url: "/settings?tab=code",
            marks: [
                { n: 1, sel: `${overrides} tbody tr`, pad: 2 },
                { n: 2, sel: `${overrides} tbody tr`, nth: 1, pad: 2 },
            ],
            full: true,
            clip: { sel: overrides, pad: 24 },
        },
    ];
}
