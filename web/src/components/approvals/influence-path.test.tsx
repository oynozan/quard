import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Label, PathNode } from "@/lib/data/types";
import { NOW, SECOND } from "@/lib/data/rng";
import { openRequest } from "../../../test/approvals-overview/fixtures";
import { InfluencePath } from "./influence-path";

const WEB: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

function node(kind: PathNode["kind"], title: string, label: Label, at: number): PathNode {
    return { kind, role: null, title, detail: "", agent: null, runId: "run_1", stepId: title, label, at };
}

function steps(container: HTMLElement) {
    return [...container.querySelectorAll("ol > li")];
}

describe("InfluencePath", () => {
    it("names the path by its length and lists each step with its time", async () => {
        const { path } = await openRequest("apr_7f31");
        const { container } = render(<InfluencePath nodes={path} waiting pathId="apr_7f31-path" />);
        expect(screen.getByRole("list").getAttribute("aria-label")).toBe(
            "Influence path, 5 steps from entry point to this call",
        );
        const first = steps(container)[0];
        expect(first.querySelector("p")?.textContent).toBe(
            "originsupplier-portal.exampleweb:supplier-portal.exampleuntrusted",
        );
        expect(first.querySelector("time")?.textContent).toBe("18:35:48");
    });

    it("shows a chip where untrusted content enters and on this call, and only the trust word between", async () => {
        const { path } = await openRequest("apr_7f31");
        const { container } = render(<InfluencePath nodes={path} waiting pathId="apr_7f31-path" />);
        const chips = steps(container).map((item) => item.querySelector("[title]")?.getAttribute("title") ?? null);
        expect(chips).toEqual([
            "web:supplier-portal.example · untrusted · public",
            null,
            "agent:researcher · untrusted · internal",
            "web:supplier-portal.example · untrusted · internal",
            "web:supplier-portal.example · untrusted · internal",
        ]);
        expect(steps(container)[1].querySelector(".sr-only")?.textContent).toBe("untrusted");
    });

    it("shows no chip on a trusted path", () => {
        const nodes = [node("origin", "user", USER, NOW), node("call", "deploy_service", USER, NOW + SECOND)];
        const { container } = render(<InfluencePath nodes={nodes} waiting={false} pathId="p" />);
        expect(container.querySelector("[title]")).toBeNull();
        expect([...container.querySelectorAll(".sr-only")].map((item) => item.textContent)).toEqual([
            "trusted",
            "trusted",
        ]);
    });

    it("colors each square and link by the trust of the content it carries", () => {
        const nodes = [
            node("origin", "user", USER, NOW),
            node("agent", "billing", WEB, NOW + SECOND),
            node("call", "pay_invoice", USER, NOW + 2 * SECOND),
        ];
        const { container } = render(<InfluencePath nodes={nodes} waiting pathId="p" />);
        const patterns = [...container.querySelectorAll("pattern")];
        expect(patterns.map((item) => item.id)).toEqual(["p-0", "p-1"]);
        expect(patterns.map((item) => item.querySelector("rect")?.getAttribute("class"))).toEqual([
            "fill-caution-border",
            "fill-line-strong",
        ]);
        expect(container.querySelectorAll("svg")).toHaveLength(2);
        const squares = steps(container).map((item) => item.querySelector("span[aria-hidden]")?.className);
        expect(squares[0]).toContain("bg-chart-context");
        expect(squares[1]).toContain("bg-caution-text");
    });

    it("sets the call title in mono and marks a waiting call in warning", () => {
        const nodes = [node("origin", "user", USER, NOW), node("call", "pay_invoice", USER, NOW + SECOND)];
        const { container, rerender } = render(<InfluencePath nodes={nodes} waiting pathId="p" />);
        expect(screen.getByText("pay_invoice").className).toContain("mono");
        expect(screen.getByText("user", { selector: "span" }).className).not.toContain("mono");
        const square = () => steps(container)[1].querySelector("span[aria-hidden]")?.className;
        expect(square()).toContain("bg-warning");
        rerender(<InfluencePath nodes={nodes} waiting={false} pathId="p" />);
        expect(square()).toContain("border-line-strong");
        expect(square()).not.toContain("bg-warning");
    });
});
