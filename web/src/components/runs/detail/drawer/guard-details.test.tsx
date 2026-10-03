import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GuardDecision } from "@/lib/data/runs/types";
import { detailValue } from "../../../../../test/runs-detail-list/dom";
import { makeGuard } from "../../../../../test/runs-detail-list/fixtures";
import { GuardDetails } from "./guard-details";

function show(fields: Partial<GuardDecision> = {}) {
    const { container } = render(<GuardDetails guard={makeGuard(fields)} />);
    return container;
}

// The class of the status square before the decision word.
function squareTone(container: HTMLElement): string {
    const square = container.querySelector("dd span[aria-hidden]");
    return square?.className.match(/bg-\S+|border-line-strong/)?.[0] ?? "";
}

describe("GuardDetails", () => {
    it("lists the decision, guard, tool, rule, hashes, mode and delivery", () => {
        const container = show();
        expect(detailValue(container, "Decision")).toBe("Blocked");
        expect(detailValue(container, "Guard")).toBe("Action guard");
        expect(detailValue(container, "Tool")).toBe("payInvoice");
        expect(detailValue(container, "Rule")).toBe("iban:from");
        expect(detailValue(container, "Rule hash")).toBe("rule-hash-1");
        expect(detailValue(container, "Rules hash")).toBe("rules-hash-1");
        expect(detailValue(container, "Mode")).toBe("Enforce");
        expect(detailValue(container, "Degraded")).toBe("No");
        expect(screen.getByText("The IBAN came from a web page.")).toBeTruthy();
    });

    it("marks an enforced block red and an observed block as off", () => {
        expect(squareTone(show())).toBe("bg-danger");
        const observed = show({ mode: "observe" });
        expect(detailValue(observed, "Decision")).toBe("Would block");
        expect(detailValue(observed, "Mode")).toBe("Observe");
        expect(squareTone(observed)).toBe("border-line-strong");
    });

    it("marks an enforced ask amber and an observed ask as off", () => {
        const asked = show({ outcome: "ask" });
        expect(detailValue(asked, "Decision")).toBe("Asked a human");
        expect(squareTone(asked)).toBe("bg-warning");
        const observed = show({ outcome: "ask", mode: "observe" });
        expect(detailValue(observed, "Decision")).toBe("Would ask");
        expect(squareTone(observed)).toBe("border-line-strong");
    });

    it("marks other outcomes with the context color", () => {
        const allowed = show({ outcome: "allow" });
        expect(detailValue(allowed, "Decision")).toBe("Allowed");
        expect(squareTone(allowed)).toBe("bg-chart-context");
    });

    it("says an approval guard always asks and that a late decision was degraded", () => {
        const container = show({ guard: "approval", outcome: "ask", mode: null, degraded: true });
        expect(detailValue(container, "Guard")).toBe("Approval guard");
        expect(detailValue(container, "Mode")).toBe("Always asks");
        expect(detailValue(container, "Degraded")).toBe("Yes, sent late");
    });

    it("leaves out the scan row and findings when nothing was scanned", () => {
        const container = show();
        expect(screen.queryByText("Jev score")).toBeNull();
        expect(container.querySelector("ul")).toBeNull();
    });

    it("shows a source scan's score and what it found", () => {
        const scan = { scanned: true, findings: ["Hidden text", "Instructions to an AI"], jevScore: 0.876 };
        const container = show({ guard: "source", outcome: "flag", scan });
        expect(detailValue(container, "Jev score")).toBe("0.88");
        expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(scan.findings);
    });

    it("says a scan was not scored and lists no findings when it found none", () => {
        const container = show({ guard: "source", scan: { scanned: true, findings: [], jevScore: null } });
        expect(detailValue(container, "Jev score")).toBe("Not scored");
        expect(container.querySelector("ul")).toBeNull();
    });
});
