import type { Job } from "../types.ts";
import { DIALOG, section } from "./shared.ts";

// The Summary page
export const SUMMARY_JOBS: Job[] = summaryJobs();

function summaryJobs(): Job[] {
    const limits = section("Run limits");
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
                { n: 1, sel: "button", text: "All guards", closest: "div" },
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
                { n: 1, sel: `${limits} *`, text: "would stop" },
                { n: 2, sel: `${limits} *`, text: "stopped" },
                { n: 3, sel: `${limits} *`, text: "3 levels" },
            ],
            full: true,
            clip: { sel: limits, pad: 24 },
        },
        {
            name: "summary-quarantine",
            url: "/summary",
            marks: [
                { n: 1, sel: `${section("Quarantine")} tbody tr`, pad: 2 },
                { n: 2, sel: "button", text: "Mark as known" },
                { n: 3, sel: `${section("Quarantine")} h3`, text: "Watching", closest: "div" },
                { n: 4, sel: "button", text: "more at 1 run" },
            ],
            full: true,
            clip: { sel: section("Quarantine"), pad: 24 },
        },
        {
            name: "summary-mark-known",
            url: "/summary",
            actions: [{ click: { sel: "button", text: "Mark as known" }, wait: 1200 }],
            marks: [
                { n: 1, sel: `${DIALOG} h2`, badge: "l" },
                { n: 2, sel: `${DIALOG} section`, badge: "l" },
                { n: 3, sel: `${DIALOG} button`, text: "Mark as known", badge: "l" },
            ],
        },
    ];
}
