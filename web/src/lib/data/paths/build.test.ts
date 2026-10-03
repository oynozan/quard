// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HOUR, NOW } from "../rng";
import { DEPLOY_RUN_ID, REFUND_RUN_ID } from "../runs/scripts/approval-runs";
import { LOOP_RUN_ID } from "../runs/scripts/registry";
import { STORY_RUN_ID } from "../runs/scripts/story";
import { stalePrices } from "../runs/scripts/incident-runs";
import { searchedAddress, tenfoldAmount } from "../runs/scripts/archive-runs";
import { buildPinned, buildRun, callsTo, marked, type Built } from "../../../../test/data-scripts-paths/build";
import type { RunBuilder } from "../runs/build/builder";
import { influencePath, nodeOf } from "./build";
import type { PathNode } from "../types";

const RUN = "f".repeat(32);
const IBAN = "DE89 3704 0044 0532 0130 00";
const build = (write: (b: RunBuilder) => void) => buildRun(write, RUN, NOW - HOUR);

const brief = (nodes: PathNode[]) => nodes.map((node) => [node.kind, node.title]);
const stepOf = (run: Built, kind: string) => run.detail.steps.find((step) => step.kind === kind)!;

describe("nodeOf", () => {
    it("shows a handoff with the sender's carried labels", () => {
        const run = buildPinned(STORY_RUN_ID);
        const node = nodeOf(run.detail, marked(run, "carry"), "carry");
        expect(node).toMatchObject({
            kind: "handoff",
            role: "carry",
            title: "researcher to billing",
            agent: "researcher",
        });
        expect(node.label).toEqual({ origin: "agent:researcher", trust: "untrusted", sensitivity: "internal" });
        expect(node.runId).toBe(STORY_RUN_ID);
    });

    it("shows a delegation as a handoff and a reply as a message", () => {
        const run = buildPinned(LOOP_RUN_ID);
        const delegation = stepOf(run, "handoff");
        expect(delegation.link?.kind).toBe("delegation");
        expect(nodeOf(run.detail, delegation, null)).toMatchObject({
            kind: "handoff",
            title: "orchestrator to researcher",
        });
        const reply = nodeOf(run.detail, stepOf(run, "message"), null);
        expect(reply).toMatchObject({ kind: "message", title: "researcher to orchestrator" });
        expect(reply.detail).toBe("No prices found. The carrier pages need a login.");
    });

    it("shows a memory read by its store and key, with the label it came back with", () => {
        const run = buildPinned(stalePrices);
        const node = nodeOf(run.detail, stepOf(run, "memory_read"), null);
        expect(node).toMatchObject({ kind: "memory", title: "supplier-notes/SUP-002190/prices" });
        expect(node.label.origin).toBe("tool:lookup_supplier");
    });

    it("shows a model call as its agent, labeled with what it had read", () => {
        const run = buildPinned(STORY_RUN_ID);
        const turn = marked(run, "turning");
        const node = nodeOf(run.detail, turn, "turning");
        expect(node).toMatchObject({ kind: "agent", title: "billing", detail: "Asked for pay_invoice" });
        expect(node.label).toEqual(turn.context);
    });

    it("labels a model call as the agent itself when it is the origin", () => {
        const run = buildPinned(tenfoldAmount);
        const node = nodeOf(run.detail, marked(run, "entry"), "entry", true);
        expect(node.label).toEqual({ origin: "agent:billing", trust: "trusted", sensitivity: "internal" });
    });

    it("shows a call with its error after the detail", () => {
        const run = buildPinned(DEPLOY_RUN_ID);
        const [deploy] = callsTo(run, "deploy_service");
        expect(nodeOf(run.detail, deploy, null).detail).toBe(
            "api-gateway · The host stopped the process while it waited for approval",
        );
        const [tests] = callsTo(run, "run_tests");
        expect(nodeOf(run.detail, tests, null)).toMatchObject({
            kind: "call",
            title: "run_tests",
            detail: "api-gateway",
        });
    });
});

describe("nodeOf for content that came in", () => {
    it("titles web content by its host and adds what the scan found", () => {
        const run = buildPinned(STORY_RUN_ID);
        const node = nodeOf(run.detail, marked(run, "entry"), "entry", true);
        expect(node).toMatchObject({
            kind: "origin",
            title: "supplier-portal.example",
            detail: "fetch_page · flag: hidden text, instructions aimed at an AI",
        });
    });

    it("shows a clean scan by its outcome alone", () => {
        const run = buildPinned(REFUND_RUN_ID);
        const node = nodeOf(run.detail, callsTo(run, "read_inbox")[0], null, true);
        expect(node).toMatchObject({ title: "claims-desk.io", detail: "read_inbox · pass" });
    });

    it("titles hosted search results and says they were never scanned", () => {
        const run = buildPinned(searchedAddress);
        const node = nodeOf(run.detail, marked(run, "entry"), "entry", true);
        expect(node).toMatchObject({ title: "Hosted web search", detail: "web_search · unscanned" });
    });

    it("calls a guarded tool's result trusted when no source check ran", () => {
        const lookup = build((b) => {
            b.tool("billing", "lookup_supplier", { args: { supplier_id: "SUP-004417" }, output: { summary: "Found" } });
        });
        const node = nodeOf(lookup.detail, callsTo(lookup, "lookup_supplier")[0], null, true);
        expect(node).toMatchObject({ title: "lookup_supplier", detail: "lookup_supplier · trusted tool result" });
    });

    it("says an unwrapped tool's result was never scanned, titled by an origin with no kind", () => {
        const run = build((b) => {
            b.tool("deploy-bot", "read_build_log", {
                args: { build: "b-1" },
                output: { summary: "Ok", origin: "intranet" },
            });
        });
        const node = nodeOf(run.detail, callsTo(run, "read_build_log")[0], null, true);
        expect(node).toMatchObject({
            title: "intranet",
            detail: "read_build_log · not wrapped with guard(), never scanned",
        });
    });

    it("titles an origin with an empty detail by the whole origin", () => {
        const run = build((b) => {
            b.tool("deploy-bot", "read_build_log", {
                args: { build: "b-1" },
                output: { summary: "Ok", origin: "web:" },
            });
        });
        expect(nodeOf(run.detail, callsTo(run, "read_build_log")[0], null, true).title).toBe("web:");
    });

    it("labels a guarded tool that failed before returning as the tool", () => {
        const run = buildPinned(stalePrices);
        const node = nodeOf(run.detail, marked(run, "entry"), "entry", true);
        expect(node).toMatchObject({ kind: "call", detail: "SUP-002190 · Timed out after 30 s" });
        expect(node.label).toEqual({ origin: "tool:lookup_supplier", trust: "trusted", sensitivity: "internal" });
    });

    it("labels an unwrapped tool that returned nothing as unknown, and says it failed", () => {
        const run = build((b) => {
            b.tool("deploy-bot", "read_build_log", { args: { build: "b-1" } });
        });
        const node = nodeOf(run.detail, callsTo(run, "read_build_log")[0], null, true);
        expect(node.detail).toBe("b-1 · failed");
        expect(node.label).toEqual({ origin: "unknown:read_build_log", trust: "untrusted", sensitivity: "internal" });
    });
});

describe("influencePath", () => {
    it("follows planted content from the page, through the handoff, to the payment", () => {
        const run = buildPinned(STORY_RUN_ID);
        const path = influencePath(run.detail, marked(run, "damage"));
        expect(brief(path)).toEqual([
            ["origin", "supplier-portal.example"],
            ["agent", "researcher"],
            ["handoff", "researcher to billing"],
            ["agent", "billing"],
            ["call", "pay_invoice"],
        ]);
        expect(path.every((node) => node.role === null)).toBe(true);
    });

    it("starts at the user's message when the user gave the traced value", () => {
        const run = buildPinned(STORY_RUN_ID);
        const path = influencePath(run.detail, callsTo(run, "fetch_page")[0]);
        expect(path[0]).toMatchObject({
            kind: "origin",
            title: "user",
            detail: "The user's message",
            agent: "orchestrator",
        });
        expect(brief(path).slice(1)).toEqual([
            ["handoff", "orchestrator to researcher"],
            ["agent", "researcher"],
            ["call", "fetch_page"],
        ]);
    });

    it("shows only the call when nothing came in before it", () => {
        const run = buildPinned(REFUND_RUN_ID);
        const [inbox] = callsTo(run, "read_inbox");
        expect(brief(influencePath(run.detail, inbox))).toEqual([["call", "read_inbox"]]);
    });

    it("does not repeat the model call that is already the origin", () => {
        const run = buildPinned(tenfoldAmount);
        const path = influencePath(run.detail, callsTo(run, "lookup_supplier")[0]);
        expect(brief(path)).toEqual([
            ["origin", "user"],
            ["call", "lookup_supplier"],
        ]);
    });

    it("falls back to a trusted origin when no untrusted content reached the arguments", () => {
        const run = buildPinned(tenfoldAmount);
        const [origin] = influencePath(run.detail, callsTo(run, "pay_invoice")[0]);
        expect(origin).toMatchObject({ title: "lookup_supplier", detail: "lookup_supplier · trusted tool result" });
    });

    it("skips the reader when no model call read the content afterwards", () => {
        const run = buildPinned(searchedAddress);
        expect(brief(influencePath(run.detail, marked(run, "damage")))).toEqual([
            ["origin", "Hosted web search"],
            ["handoff", "researcher to billing"],
            ["agent", "billing"],
            ["call", "send_email"],
        ]);
    });

    it("shows who passed content on between several handoffs", () => {
        const run = buildPinned(LOOP_RUN_ID);
        const second = callsTo(run, "fetch_page")[1];
        expect(brief(influencePath(run.detail, second))).toEqual([
            ["origin", "help.contoso-freight.example"],
            ["agent", "researcher"],
            ["message", "researcher to orchestrator"],
            ["agent", "orchestrator"],
            ["handoff", "orchestrator to researcher"],
            ["agent", "researcher"],
            ["call", "fetch_page"],
        ]);
    });

    it("leaves out a handoff that did not carry the content", () => {
        const run = buildPinned(STORY_RUN_ID);
        const detail = structuredClone(run.detail);
        const handoff = detail.steps.find((step) => step.id === marked(run, "carry").id);
        handoff!.link!.carries = [];
        const pay = detail.steps.find((step) => step.id === marked(run, "damage").id)!;
        expect(brief(influencePath(detail, pay))).toEqual([
            ["origin", "supplier-portal.example"],
            ["agent", "billing"],
            ["call", "pay_invoice"],
        ]);
    });

    it("chains handoffs that pass content on without a model call between them", () => {
        const run = build((b) => {
            b.tool("researcher", "fetch_page", {
                args: { url: "https://portal.example/invoice" },
                parentId: null,
                output: { summary: `Pay ${IBAN}`, values: [{ value: IBAN }] },
            });
            b.model("researcher", { calls: ["delegate"] });
            b.delegate("researcher", "billing", { text: "Pay the invoice", values: [{ value: IBAN }] });
            b.delegate("billing", "payer", { text: "Pay the invoice", values: [{ value: IBAN }] });
            b.model("payer", { calls: ["pay_invoice"] });
            b.tool("payer", "pay_invoice", { args: { iban: IBAN, amount: "10.00 EUR" } });
        });
        expect(brief(influencePath(run.detail, callsTo(run, "pay_invoice")[0]))).toEqual([
            ["origin", "portal.example"],
            ["agent", "researcher"],
            ["handoff", "researcher to billing"],
            ["handoff", "billing to payer"],
            ["agent", "payer"],
            ["call", "pay_invoice"],
        ]);
    });

    it("shows no asking agent when the call hangs under no model call", () => {
        const run = build((b) => {
            b.tool("support", "read_inbox", {
                args: { mailbox: "support" },
                kinds: { mailbox: "text" },
                parentId: null,
                output: {
                    origin: "email:claims.example",
                    summary: "Write to a@claims.example",
                    values: [{ value: "a@claims.example" }],
                },
            });
            b.tool("support", "send_email", { args: { to: "a@claims.example" }, parentId: null });
        });
        expect(brief(influencePath(run.detail, callsTo(run, "send_email")[0]))).toEqual([
            ["origin", "claims.example"],
            ["call", "send_email"],
        ]);
    });
});
