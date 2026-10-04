import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MissingGuard, Verdict } from "@/lib/data/incidents/types";
import { VerdictBlock } from "./verdict";

function verdictOf(extra: Partial<Verdict>): Verdict {
    return {
        category: "bad input",
        missingGuard: null,
        handoffFault: null,
        acrossAgents: null,
        versions: [],
        ...extra,
    };
}

const OBSERVED: MissingGuard = {
    text: 'The action rule "iban:from" on payInvoice is in observe mode, so it only recorded "would block"',
    tool: "payInvoice",
    guard: "action",
    rule: "iban:from",
    observe: true,
};

// The value cell next to a term
function valueOf(term: string) {
    return screen.getByText(term).nextElementSibling as HTMLElement;
}

describe("VerdictBlock", () => {
    it("says the guards held when none was missing, with no handoff or versions", () => {
        render(<VerdictBlock verdict={verdictOf({})} />);
        expect(screen.getByRole("region", { name: "Verdict" })).toBeTruthy();
        expect(valueOf("Category").textContent).toBe("bad input");
        expect(valueOf("Missing guard").textContent).toBe("None, guards held");
        expect(screen.queryByText("Bad handoff")).toBeNull();
        expect(screen.queryByText("Entry agent")).toBeNull();
        expect(screen.queryByRole("button", { name: "Agent versions" })).toBeNull();
    });

    it("shows the tool and rule, marks a rule in observe mode, then says what was missing", () => {
        render(<VerdictBlock verdict={verdictOf({ missingGuard: OBSERVED })} />);
        expect(valueOf("Missing guard").textContent).toBe(`payInvoiceiban:fromobserve only${OBSERVED.text}`);
        expect(screen.getByText("iban:from").className).toContain("mono");
    });

    it("shows the tool alone when no rule exists", () => {
        const text = "payInvoice has no action, egress or approval guard";
        const guard = { text, tool: "payInvoice", guard: null, rule: null, observe: false };
        render(<VerdictBlock verdict={verdictOf({ missingGuard: guard })} />);
        expect(valueOf("Missing guard").textContent).toBe(`payInvoice${text}`);
        expect(screen.queryByText("observe only")).toBeNull();
    });

    it("names a bad handoff in sentence case", () => {
        render(<VerdictBlock verdict={verdictOf({ category: "bad handoff", handoffFault: "constraint dropped" })} />);
        expect(valueOf("Bad handoff").textContent).toBe("Constraint dropped");
    });

    it("names the agent of each part and the handoff that carried the content", () => {
        const handoff = {
            stepId: "h1",
            kind: "tool",
            from: "research bot",
            to: "billing",
            at: "2026-10-03T12:00:00.000Z",
            trust: "untrusted",
            verified: false,
        } as const;
        const across = { entryAgent: "research bot", handoff, turningAgent: "billing", damageAgent: "payer" };
        render(<VerdictBlock verdict={verdictOf({ category: "bad handoff", acrossAgents: across })} />);
        expect(valueOf("Category").textContent).toBe("bad handoff");
        const agentOf = (term: string) => valueOf(term).querySelector("a")?.getAttribute("href");
        expect(agentOf("Entry agent")).toBe("/agents/research%20bot");
        expect(agentOf("Turning agent")).toBe("/agents/billing");
        expect(agentOf("Damage agent")).toBe("/agents/payer");
        expect(valueOf("Carried by").textContent).toBe("Agent run as a toolresearch bottobillingnot verified");
    });

    it("marks a verified handoff, and says when no handoff was found", () => {
        const across = { entryAgent: "a", turningAgent: "b", damageAgent: "b" };
        const handoff = { stepId: "h1", from: "a", to: "b", at: "", trust: "trusted", verified: true } as const;
        const { rerender } = render(
            <VerdictBlock
                verdict={verdictOf({ acrossAgents: { ...across, handoff: { ...handoff, kind: "message" } } })}
            />,
        );
        expect(valueOf("Carried by").textContent).toBe("Messageatobverified");
        rerender(
            <VerdictBlock
                verdict={verdictOf({ acrossAgents: { ...across, handoff: { ...handoff, kind: "handoff" } } })}
            />,
        );
        expect(valueOf("Carried by").textContent).toBe("Handoffatobverified");
        rerender(<VerdictBlock verdict={verdictOf({ acrossAgents: { ...across, handoff: null } })} />);
        expect(valueOf("Carried by").textContent).toBe("No handoff found");
    });

    it("lists agent versions behind a toggle, each linking to its agent", () => {
        const versions = [
            { agent: "billing", version: "1.4.0" },
            { agent: "research bot", version: "2.0.1" },
        ];
        render(<VerdictBlock verdict={verdictOf({ versions })} />);
        const toggle = screen.getByRole("button", { name: "Agent versions" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        const link = screen.getByRole("link", { name: "research bot" });
        expect(link.getAttribute("href")).toBe("/agents/research%20bot");
        expect(link.closest("dt")?.nextElementSibling?.textContent).toBe("2.0.1");
        expect(screen.getByRole("link", { name: "billing" }).getAttribute("href")).toBe("/agents/billing");
    });
});
