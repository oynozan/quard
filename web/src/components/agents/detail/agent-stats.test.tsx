import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentStats as Stats } from "@/lib/data/agents";
import { AgentStats } from "./agent-stats";

const stats: Stats = {
    modelCalls24h: 900,
    influencedShare: 0.423,
    costUsd24h: 1234.5,
    costKnown: true,
    asked24h: 3,
    blocked24h: 1200,
};

function value(label: string) {
    return screen.getByText(label).nextElementSibling as HTMLElement;
}

describe("AgentStats", () => {
    it("shows the last 24 hours as four labeled numbers", () => {
        render(<AgentStats stats={stats} />);
        expect(screen.getByRole("region", { name: "Last 24 hours" })).toBeTruthy();
        expect(value("Asked").textContent).toBe("3");
        expect(value("Blocked").textContent).toBe("1,200");
        expect(value("Calls after untrusted").textContent).toBe("42%");
        expect(value("Est. cost").textContent).toBe("$1,234.50");
    });

    it("shows a cost below a cent instead of $0.00", () => {
        render(<AgentStats stats={{ ...stats, costUsd24h: 0.003075 }} />);
        expect(value("Est. cost").textContent).toBe("$0.0031");
    });

    it("flags asks and blocks with a glyph when there were any", () => {
        render(<AgentStats stats={stats} />);
        expect(value("Asked").querySelector(".text-warning svg")).toBeTruthy();
        expect(value("Blocked").querySelector(".text-danger svg")).toBeTruthy();
        expect(value("Est. cost").querySelector("svg")).toBeNull();
    });

    it("drops the glyphs when nothing was asked or blocked", () => {
        render(<AgentStats stats={{ ...stats, asked24h: 0, blocked24h: 0 }} />);
        expect(value("Asked").textContent).toBe("0");
        expect(value("Asked").querySelector("svg")).toBeNull();
        expect(value("Blocked").querySelector("svg")).toBeNull();
    });

    it("shows a dash for the untrusted share without model calls, and for a cost it cannot know", () => {
        render(<AgentStats stats={{ ...stats, modelCalls24h: 0, influencedShare: null, costKnown: false }} />);
        expect(value("Calls after untrusted").textContent).toBe("—");
        expect(value("Est. cost").textContent).toBe("—");
    });
});
