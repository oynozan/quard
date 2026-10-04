import type { Job } from "../types.ts";

const FIELD = 'input[aria-label="Search all runs"]';
// Each run's matches sit in a tbody named after the run, such as "Run ce8f3554"
const RUN_ROWS = 'main tbody[aria-label^="Run "] tr';

// Search and its results
export const SEARCH_JOBS: Job[] = [
    {
        name: "search",
        url: "/search",
        marks: [
            { n: 1, sel: FIELD, closest: "label" },
            { n: 2, sel: 'form[role="search"] button', text: "Search" },
            { n: 3, sel: 'section[aria-labelledby="search-kinds"]' },
        ],
    },
    {
        // The supplier IBAN that the sandbox's billing and payments runs read and pay
        name: "search-results",
        url: "/search?q=DE89370400440532013000",
        marks: [
            { n: 1, sel: 'main h2[role="status"]' },
            { n: 2, sel: "main span", text: "IBAN" },
            { n: 3, sel: "main span", text: "by hash" },
            { n: 4, sel: RUN_ROWS, pad: 2 },
            { n: 5, sel: RUN_ROWS, nth: 1, pad: 2 },
            // Origin chips carry "origin · trust · sensitivity" as their title
            { n: 6, sel: 'main tbody span[title*=" · "]', nth: 1 },
        ],
        height: 1000,
    },
];
