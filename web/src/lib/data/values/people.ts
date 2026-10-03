import { NOW, MINUTE, HOUR, DAY } from "../rng";

// Dashboard accounts. Every approval records who decided.
export type Account = {
    email: string;
    name: string;
    role: "admin" | "approver";
    createdAt: number;
    lastSignInAt: number | null;
};

export const ACCOUNTS: Account[] = [
    {
        email: "dana@acme.com",
        name: "Dana Whitfield",
        role: "admin",
        createdAt: NOW - 96 * DAY,
        lastSignInAt: NOW - 38 * MINUTE,
    },
    {
        email: "li.wei@acme.com",
        name: "Li Wei",
        role: "admin",
        createdAt: NOW - 96 * DAY,
        lastSignInAt: NOW - 2 * DAY - 4 * HOUR,
    },
    {
        email: "marco@acme.com",
        name: "Marco Bianchi",
        role: "approver",
        createdAt: NOW - 71 * DAY,
        lastSignInAt: NOW - 3 * HOUR - 12 * MINUTE,
    },
    {
        email: "priya@acme.com",
        name: "Priya Raman",
        role: "approver",
        createdAt: NOW - 64 * DAY,
        lastSignInAt: NOW - 1 * HOUR - 5 * MINUTE,
    },
    {
        email: "sam.okafor@acme.com",
        name: "Sam Okafor",
        role: "approver",
        createdAt: NOW - 2 * DAY,
        lastSignInAt: null,
    },
];

// People who answer approval requests in the mock runs.
export const APPROVERS = ["marco@acme.com", "priya@acme.com", "dana@acme.com", "li.wei@acme.com"];
