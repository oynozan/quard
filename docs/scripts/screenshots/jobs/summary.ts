import type { Job } from "../types.ts";
import { DIALOG, section } from "./shared.ts";

// The Summary page
export const SUMMARY_JOBS: Job[] = summaryJobs();

function summaryJobs(): Job[] {
    const quarantine = section("Quarantine");
    const spend = section("x402 spend");
    return [
        {
            name: "summary-incidents",
            url: "/summary",
            marks: [
                { n: 1, sel: section("By entry source") },
                { n: 2, sel: section("By damaging tool") },
            ],
            full: true,
            clip: { sel: section("Where incidents start"), pad: 24 },
        },
        {
            name: "summary-blocks",
            url: "/summary",
            marks: [
                { n: 1, sel: '[aria-label="Guard type"]' },
                { n: 2, sel: section("Blocks per day") },
                { n: 3, sel: section("Blocks by hour, all guards") },
            ],
            full: true,
            clip: { sel: section("What guards block"), pad: 24 },
        },
        {
            name: "summary-links",
            url: "/summary",
            marks: [
                { n: 1, sel: section("Entry points") },
                { n: 2, sel: section("Turning points") },
                { n: 3, sel: section("Untrusted links") },
            ],
            full: true,
            clip: { sel: section("Agents and links"), pad: 24 },
        },
        {
            name: "summary-limits",
            url: "/summary",
            marks: [
                { n: 1, sel: `${section("Loops limit")} h3` },
                { n: 2, sel: `${section("Loops limit")} span.mono`, pad: 4 },
                { n: 3, sel: `${section("Loops limit")} span[title^="Rule:"]` },
                { n: 4, sel: `${section("Loops limit")} [role="progressbar"]` },
            ],
            full: true,
            clip: { sel: section("Run limits"), pad: 24 },
        },
        {
            name: "summary-spend",
            url: "/summary",
            marks: [
                { n: 1, sel: `${spend} h2` },
                { n: 2, sel: section("Spend per day") },
                { n: 3, sel: section("By agent") },
                { n: 4, sel: section("By host") },
                { n: 5, sel: section("By payee") },
            ],
            full: true,
            clip: { sel: spend, pad: 24 },
        },
        {
            name: "summary-payees",
            url: "/summary",
            marks: [
                { n: 1, sel: section("New payees") },
                { n: 2, sel: section("Quarantined payees") },
            ],
            full: true,
            clip: { sel: section("Payees"), pad: 24 },
        },
        {
            name: "summary-quarantine",
            url: "/summary",
            marks: [
                { n: 1, sel: `${quarantine} h2` },
                { n: 2, sel: `${quarantine} p`, text: "Observe mode until" },
                { n: 3, sel: `${quarantine} tbody tr`, pad: 2 },
                { n: 4, sel: "button", text: "Mark as known" },
                { n: 5, sel: `${quarantine} h3`, text: "Watching", closest: "div" },
            ],
            full: true,
            clip: { sel: quarantine, pad: 24 },
        },
        {
            name: "summary-mark-known",
            url: "/summary",
            actions: [{ click: { sel: "button", text: "Mark as known" }, wait: 1200 }],
            marks: [
                { n: 1, sel: `${DIALOG} button`, text: "Copy", closest: "div", badge: "l" },
                { n: 2, sel: `${DIALOG} section`, badge: "l" },
                { n: 3, sel: `${DIALOG} button`, text: "Mark as known", badge: "l" },
                { n: 4, sel: `${DIALOG} button`, text: "Cancel", badge: "l" },
            ],
        },
    ];
}
