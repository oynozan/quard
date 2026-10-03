import { NOW, MINUTE, HOUR, DAY } from "../../rng";
import * as approvals from "./approval-runs";
import * as archive from "./archive-runs";
import * as more from "./archive-runs-more";
import * as incidents from "./incident-runs";
import { STORY_RUN_ID, STORY_STARTED_AT, supplierStory } from "./story";
import type { RunBuilder } from "../build/builder";

// A run written by hand, because an approval, an incident or the decision log points at it.
export type PinnedRun = {
    id: string;
    startedAt: number;
    write: (b: RunBuilder) => void;
    incidentId: string | null;
    approvalId: string | null;
};

function pin(
    id: string,
    startedAt: number,
    write: PinnedRun["write"],
    links: { incidentId?: string; approvalId?: string } = {},
): PinnedRun {
    return { id, startedAt, write, incidentId: links.incidentId ?? null, approvalId: links.approvalId ?? null };
}

// The decision log on the overview also shows these two runs.
export const STRIPPED_RUN_ID = "5d0e7a21b3c94f68a2e7d0c5b9f1e384";
export const LOOP_RUN_ID = "8c41f9b0e2d74a3c95b8f1e6a0d3c729";

export const PINNED_RUNS: PinnedRun[] = [
    pin(STORY_RUN_ID, STORY_STARTED_AT, supplierStory, { incidentId: "inc_118", approvalId: "apr_7f31" }),
    pin(
        approvals.REFUND_REPEAT_RUN_ID,
        approvals.REFUND_REPEAT_AT - 9_400,
        approvals.refundReply(approvals.REFUND_REPEAT_AT),
        {
            approvalId: "apr_7f2c",
        },
    ),
    pin(STRIPPED_RUN_ID, NOW - 3 * MINUTE - 50_000, incidents.strippedEmail),
    pin(LOOP_RUN_ID, NOW - 7 * MINUTE - 12_000, incidents.delegationLoop),
    pin(approvals.REFUND_RUN_ID, approvals.REFUND_ASKED_AT - 10_800, approvals.refundReply(approvals.REFUND_ASKED_AT), {
        approvalId: "apr_7f2c",
    }),
    pin(approvals.DEPLOY_RUN_ID, approvals.DEPLOY_ASKED_AT - 74_000, approvals.productionDeploy, {
        approvalId: "apr_7f1e",
    }),
    pin(approvals.CONTOSO_RUN_ID, approvals.CONTOSO_ASKED_AT - 8_600, approvals.contosoPayment, {
        approvalId: "apr_7f0a",
    }),
    pin(approvals.RETAINER_RUN_ID, approvals.RETAINER_ASKED_AT - 8_200, approvals.litwareRetainer),
    pin("c3a8f0d2e5b14976a0c2d8e1f6b3a947", NOW - 5 * HOUR - 6 * MINUTE, incidents.droppedCap, {
        incidentId: "inc_117",
    }),
    pin("7e2d9b4a1c6f48e3b0a5d7c2e9f1b864", NOW - 9 * HOUR - 4 * MINUTE, incidents.forwardedEmail, {
        incidentId: "inc_116",
    }),
    pin("a9c4e1f7d3b2408e96f0c5a8d1e7b326", NOW - 26 * HOUR - 3 * MINUTE, incidents.unguardedExport, {
        incidentId: "inc_115",
    }),
    pin("f0b6d3a8c1e94275a2d9e4c7b0f1a583", NOW - 2 * DAY - 4 * MINUTE, incidents.stalePrices, {
        incidentId: "inc_114",
    }),
    pin("6a1f9c3e0b7d4285a3e8c1f6d9b2a074", NOW - 4 * DAY - 3 * HOUR - 5 * MINUTE, archive.lookalikePortal, {
        incidentId: "inc_113",
    }),
    pin("3c8e1a5f7d2b4096b4e7a0c3d9f8e215", NOW - 6 * DAY - 2 * HOUR - 7 * MINUTE, archive.wrongInvoice, {
        incidentId: "inc_112",
    }),
    pin("8d4b2f6a0e9c4173a5d1b8e3c7f0a926", NOW - 8 * DAY - 5 * HOUR - 3 * MINUTE, archive.forwardHistory, {
        incidentId: "inc_111",
    }),
    pin("1e7c3a9f5b0d42e8a6c4f2b9d0e1a753", NOW - 10 * DAY - 1 * HOUR - 4 * MINUTE, archive.tenfoldAmount, {
        incidentId: "inc_110",
    }),
    pin("9f2a6d0c4e8b4b17a3d5f9c1e7b0d348", NOW - 13 * DAY - 6 * HOUR - 4 * MINUTE, archive.searchedAddress, {
        incidentId: "inc_109",
    }),
    pin("4e9b1d7c3a0f4862b5c8e2a6d1f9b037", NOW - 15 * DAY - 4 * HOUR - 6 * MINUTE, more.misreadNote, {
        incidentId: "inc_108",
    }),
    pin("7b3e0a8d6c1f4925b0d4a7e9c2f6b183", NOW - 18 * DAY - 2 * HOUR - 5 * MINUTE, more.buildLogDeploy, {
        incidentId: "inc_107",
    }),
    pin("2a6f4c8e0d3b41a7b9e5c1d7f3a0e862", NOW - 21 * DAY - 7 * HOUR - 3 * MINUTE, more.wrongRecord, {
        incidentId: "inc_106",
    }),
    pin("5c0d8b2f6e4a4319a7f1c9e3b5d0a846", NOW - 25 * DAY - 3 * HOUR - 4 * MINUTE, more.triageLoop, {
        incidentId: "inc_105",
    }),
];

export function pinnedRun(id: string): PinnedRun | undefined {
    return PINNED_RUNS.find((run) => run.id === id);
}
