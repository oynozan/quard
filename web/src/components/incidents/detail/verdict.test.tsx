import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Verdict, VerdictPoint } from "@/lib/data/incidents/types";
import { VerdictBlock } from "./verdict";

const point: VerdictPoint = {
    stepId: "s1",
    agent: "billing",
    title: "pay_invoice",
    detail: "",
    label: { origin: "supplier-portal.example", trust: "untrusted", sensitivity: "public" },
    at: 0,
};

function verdictOf(extra: Partial<Verdict>): Verdict {
    return {
        category: "bad input",
        entryPoint: point,
        turningPoint: point,
        damage: point,
        missingGuard: null,
        acrossAgents: null,
        handoffFault: null,
        versions: [],
        ...extra,
    };
}

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
        expect(screen.queryByRole("button", { name: "Agent versions" })).toBeNull();
    });

    it("shows a rule name alone and marks a rule in observe mode", () => {
        const text =
            "pay_invoice.iban-source runs in observe mode, so nothing enforces that the IBAN comes from supplier records";
        render(<VerdictBlock verdict={verdictOf({ missingGuard: text })} />);
        const guard = valueOf("Missing guard").firstElementChild as HTMLElement;
        expect(guard.getAttribute("title")).toBe(text);
        expect(guard.textContent).toBe("pay_invoice.iban-sourceobserve only");
    });

    it("shows the tool and the first clause of what was missing", () => {
        const text = "pay_invoice has no per-run amount cap, so the user's 2,000 EUR limit lived only in the prompt";
        render(<VerdictBlock verdict={verdictOf({ missingGuard: text })} />);
        const guard = valueOf("Missing guard").firstElementChild as HTMLElement;
        expect(guard.textContent).toBe("pay_invoicehas no per-run amount cap");
        expect(screen.queryByText("observe only")).toBeNull();
    });

    it("names a bad handoff in sentence case", () => {
        render(<VerdictBlock verdict={verdictOf({ category: "bad handoff", handoffFault: "constraint dropped" })} />);
        expect(valueOf("Bad handoff").textContent).toBe("Constraint dropped");
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
