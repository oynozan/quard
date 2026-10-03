import type { AgentLinkRow } from "@quard/db";
import type { FleetData } from "./types";

// Links that carried untrusted content, the largest share first and ties in query order
export function untrustedLinksOf(rows: AgentLinkRow[]): FleetData["untrustedLinks"] {
    return rows
        .filter((row) => row.untrusted > 0)
        .map(({ from, to, delegations, untrusted }) => ({
            from,
            to,
            delegations,
            untrusted,
            untrustedShare: untrusted / delegations,
        }))
        .sort((a, b) => b.untrustedShare - a.untrustedShare);
}
