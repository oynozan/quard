import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PathNode } from "@/lib/data/types";
import { IncidentPath } from "./incident-path";

const AT = Date.UTC(2026, 9, 3, 12, 0, 5);
const UNTRUSTED = { origin: "supplier-portal.example", trust: "untrusted", sensitivity: "public" } as const;
const TRUSTED = { origin: "agent-output", trust: "trusted", sensitivity: "internal" } as const;

function node(extra: Partial<PathNode>): PathNode {
    return {
        kind: "call",
        role: null,
        title: "A step",
        detail: "",
        agent: null,
        runId: "r1",
        stepId: null,
        label: TRUSTED,
        at: AT,
        ...extra,
    };
}

const PATH: PathNode[] = [
    node({
        kind: "origin",
        role: "entry",
        title: "fetch_page",
        detail: "Read the page",
        agent: "researcher",
        stepId: "s1",
        label: UNTRUSTED,
    }),
    node({ kind: "handoff", title: "researcher to billing", agent: "researcher", stepId: "s2" }),
    node({ kind: "memory", title: "Saved note", agent: null }),
    node({
        kind: "call",
        role: "damage",
        title: "pay_invoice",
        agent: "billing",
        stepId: "s4",
        label: UNTRUSTED,
        at: AT + 3000,
    }),
];

describe("IncidentPath", () => {
    it("counts the steps and the ones carrying untrusted content", () => {
        render(<IncidentPath path={PATH} />);
        const list = screen.getByRole("list");
        expect(list.getAttribute("aria-label")).toBe(
            "4 steps from entry point to damage, 2 carrying untrusted content",
        );
        expect(list.getAttribute("style")).toContain("--steps: 4");
        expect(screen.getByText("4 steps")).toBeTruthy();
        expect(screen.getByText("Path from entry point to damage")).toBeTruthy();
    });

    it("numbers each node and names it by role, or by kind when unmarked", () => {
        render(<IncidentPath path={PATH} />);
        const items = screen.getAllByRole("listitem");
        expect(within(items[0]).getByText("01").parentElement?.textContent).toBe("01Entry point");
        expect(within(items[1]).getByText("02").parentElement?.textContent).toBe("02Handoff");
        expect(within(items[2]).getByText("03").parentElement?.textContent).toBe("03Memory");
        expect(within(items[3]).getByText("04").parentElement?.textContent).toBe("04Damage");
        expect(within(items[3]).getByText("12:00:08")).toBeTruthy();
    });

    it("draws a link before every node but the first", () => {
        render(<IncidentPath path={PATH} />);
        const items = screen.getAllByRole("listitem");
        expect(items[0].querySelector("[aria-hidden]")).toBeNull();
        expect(items[1].firstElementChild?.getAttribute("aria-hidden")).toBe("true");
        expect(items[1].firstElementChild?.children).toHaveLength(4);
    });

    it("shows the agent only when the title does not already name it", () => {
        render(<IncidentPath path={PATH} />);
        const items = screen.getAllByRole("listitem");
        expect(items[0].textContent).toBe("01Entry point12:00:05fetch_pageresearchersupplier-portal.exampleuntrusted");
        expect(items[1].textContent).toBe("02Handoff12:00:05researcher to billingagent-outputtrusted");
        expect(items[2].textContent).toBe("03Memory12:00:05Saved noteagent-outputtrusted");
        expect(within(items[3]).getByText("billing")).toBeTruthy();
    });

    it("keeps the detail as the title's tooltip and shows the origin label", () => {
        render(<IncidentPath path={PATH} />);
        expect(screen.getByText("fetch_page").getAttribute("title")).toBe("Read the page");
        const items = screen.getAllByRole("listitem");
        expect(within(items[0]).getByText("supplier-portal.example").parentElement?.textContent).toBe(
            "supplier-portal.exampleuntrusted",
        );
    });
});
