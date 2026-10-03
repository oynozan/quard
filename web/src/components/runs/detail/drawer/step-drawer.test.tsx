import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalInfo, ModelUsage, Step } from "@/lib/data/runs/types";
import { detailValue, section } from "../../../../../test/runs-detail-list/dom";
import { START, TRUSTED, UNTRUSTED, makeArg, makeGuard, makeStep } from "../../../../../test/runs-detail-list/fixtures";
import { StepDrawer } from "./step-drawer";

// Passes every prop to the real drawer and keeps the last ones, so a test can ask it to open.
const drawerProps = vi.hoisted(() => ({ last: null as null | { onOpenChange: (open: boolean) => void } }));
vi.mock("@/components/ui/drawer", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/components/ui/drawer")>();
    return {
        Drawer: (props: Parameters<typeof real.Drawer>[0]) => {
            drawerProps.last = props;
            return <real.Drawer {...props} />;
        },
    };
});

function open(fields: Partial<Step> = {}) {
    const step = makeStep({ id: "abcd000000000001", detail: "Asked the model what to pay.", ...fields });
    render(<StepDrawer step={step} startedAt={START} onClose={() => {}} />);
    return screen.getByRole("dialog");
}

function usage(fields: Partial<ModelUsage> = {}): ModelUsage {
    return {
        model: "gpt-5.4-mini",
        inputTokens: 12_000,
        cachedTokens: 3000,
        outputTokens: 450,
        costUsd: 0.0031,
        toolCalls: ["fetchPage", "payInvoice"],
        ...fields,
    };
}

function approval(fields: Partial<ApprovalInfo> = {}): ApprovalInfo {
    return { requestId: "req-9", state: "waiting", by: null, decidedAt: null, argsHash: "args-hash", ...fields };
}

describe("StepDrawer", () => {
    it("stays closed while no step is chosen", () => {
        render(<StepDrawer step={null} startedAt={START} onClose={() => {}} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("titles the drawer with the step name and shows its id and detail", () => {
        const dialog = open();
        expect(screen.getByRole("heading", { level: 2, name: "gpt-5.4-mini" })).toBeTruthy();
        expect(dialog.textContent).toContain("abcd000000000001");
        expect(screen.getByText("Asked the model what to pay.")).toBeTruthy();
    });

    it("lists the kind, agent, status, timing and context of a step", () => {
        const dialog = open({ startedAt: START + 9200, durationMs: 1400, context: UNTRUSTED });
        expect(detailValue(dialog, "Kind")).toBe("Model call");
        expect(detailValue(dialog, "Agent")).toBe("billing");
        expect(detailValue(dialog, "Status")).toBe("Ok");
        expect(detailValue(dialog, "Started")).toBe("12:00:09 · +9.2 s");
        expect(detailValue(dialog, "Took")).toBe("1.4 s");
        expect(detailValue(dialog, "Context")).toBe("web:acme.netuntrustedUntrusted public");
    });

    it("says a waiting step's time is still counting", () => {
        const dialog = open({ status: "waiting", durationMs: 250 });
        expect(detailValue(dialog, "Status")).toBe("Waiting");
        expect(detailValue(dialog, "Took")).toBe("250 ms so far");
    });

    it("leaves out the parent step, hosted flag and other sections for a plain model call", () => {
        const plain = open();
        expect(screen.queryByText("Parent step")).toBeNull();
        expect(screen.queryByText("Hosted")).toBeNull();
        expect(plain.querySelectorAll("section")).toHaveLength(1);
    });

    it("shows the parent step, the hosted flag and the error of a failed step", () => {
        const dialog = open({ parentId: "ffff000000000000", hosted: true, status: "error", error: "Timed out" });
        expect(detailValue(dialog, "Parent step")).toBe("ffff000000000000");
        expect(detailValue(dialog, "Hosted")).toBe("Yes");
        expect(detailValue(dialog, "Status")).toBe("Failed");
        expect(section("Error").textContent).toBe("ErrorTimed out");
    });

    it("shows the guard decision that ruled on the step", () => {
        open({ guard: makeGuard() });
        expect(detailValue(section("Guard decision"), "Decision")).toBe("Blocked");
    });

    it("lists the arguments of a call with where each value came from", () => {
        open({ kind: "tool_call", name: "payInvoice", args: [makeArg()] });
        expect(section("Arguments").textContent).toContain("First seen inweb:acme.net");
    });

    it("says a tool call had no arguments", () => {
        open({ kind: "tool_call", name: "listInvoices" });
        expect(section("Arguments").textContent).toBe("ArgumentsNo arguments");
    });

    it("shows the model, its tokens, cost and the tools it asked for", () => {
        open({ model: usage() });
        const model = section("Model");
        expect(detailValue(model, "Model")).toBe("gpt-5.4-mini");
        expect(detailValue(model, "Input tokens")).toBe("12,000");
        expect(detailValue(model, "Cached tokens")).toBe("3,000");
        expect(detailValue(model, "Output tokens")).toBe("450");
        expect(detailValue(model, "Cost")).toBe("$0.0031");
        expect(detailValue(model, "Asked for")).toBe("fetchPage, payInvoice");
    });

    it("says when a model has no price and asked for no tools", () => {
        open({ model: usage({ costKnown: false, toolCalls: [] }) });
        const model = section("Model");
        expect(detailValue(model, "Cost")).toBe("No price for this model");
        expect(detailValue(model, "Asked for")).toBe("No tools");
    });

    it("shows what a tool brought back with its label", () => {
        open({ kind: "tool_call", output: { label: UNTRUSTED, summary: "An invoice page with an IBAN." } });
        expect(section("Output").textContent).toBe("Outputweb:acme.netuntrustedAn invoice page with an IBAN.");
    });

    it("shows a message between agents with the labels it carries", () => {
        const link = {
            kind: "handoff" as const,
            from: "billing",
            to: "researcher",
            channel: "queue" as const,
            carries: [TRUSTED, UNTRUSTED],
            labelRef: "ref-1",
            untrusted: true,
            summary: "Check the sender.",
        };
        open({ kind: "handoff", link });
        const part = section("Message between agents");
        expect(detailValue(part, "Kind")).toBe("Handoff");
        expect(detailValue(part, "From")).toBe("billing");
        expect(detailValue(part, "To")).toBe("researcher");
        expect(detailValue(part, "Channel")).toBe("queue");
        expect(detailValue(part, "Label reference")).toBe("ref-1");
        expect(part.textContent).toContain("systemtrustedweb:acme.netuntrustedCheck the sender.");
    });

    it("shows no label chips for a message that carries none", () => {
        const link = {
            kind: "message" as const,
            from: "billing",
            to: "researcher",
            channel: "http" as const,
            carries: [],
            labelRef: "ref-2",
            untrusted: false,
            summary: "Plain note.",
        };
        open({ kind: "message", link });
        const part = section("Message between agents");
        expect(detailValue(part, "Kind")).toBe("Message");
        expect(part.textContent?.endsWith("ref-2Plain note.")).toBe(true);
    });

    it("shows a memory read whose hash check passed", () => {
        open({ kind: "memory_read", memory: { store: "notes", key: "vendor", label: TRUSTED, hashOk: true } });
        const memory = section("Memory");
        expect(detailValue(memory, "Store")).toBe("notes");
        expect(detailValue(memory, "Key")).toBe("vendor");
        expect(detailValue(memory, "Label")).toBe("systemtrusted");
        expect(detailValue(memory, "Hash check")).toBe("Passed");
    });

    it("says memory changed outside the wrapper reads as untrusted", () => {
        open({ kind: "memory_read", memory: { store: "notes", key: "vendor", label: UNTRUSTED, hashOk: false } });
        expect(detailValue(section("Memory"), "Hash check")).toBe("Changed · read as untrusted");
    });

    it("links a waiting approval to the approvals page", () => {
        open({ kind: "approval", approval: approval() });
        const part = section("Approval");
        expect(detailValue(part, "Request")).toBe("req-9");
        expect(detailValue(part, "State")).toBe("Waiting");
        expect(detailValue(part, "Decided by")).toBe("Nobody yet");
        expect(detailValue(part, "Arguments hash")).toBe("args-hash");
        expect(screen.getByRole("link", { name: "Answer in Approvals" }).getAttribute("href")).toBe("/approvals#req-9");
    });

    it("shows who answered an approval, without a link", () => {
        open({ kind: "approval", approval: approval({ state: "approved once", by: "dana@acme.net" }) });
        const part = section("Approval");
        expect(detailValue(part, "State")).toBe("Approved once");
        expect(detailValue(part, "Decided by")).toBe("dana@acme.net");
        expect(screen.queryByRole("link", { name: "Answer in Approvals" })).toBeNull();
    });

    it("calls onClose when the drawer is closed", async () => {
        const onClose = vi.fn();
        render(<StepDrawer step={makeStep()} startedAt={START} onClose={onClose} />);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("leaves opening to the chosen step, so a request to open does nothing", () => {
        const onClose = vi.fn();
        render(<StepDrawer step={null} startedAt={START} onClose={onClose} />);
        act(() => drawerProps.last?.onOpenChange(true));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});
