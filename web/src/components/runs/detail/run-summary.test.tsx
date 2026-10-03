import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeRow } from "../../../../test/runs-detail-list/fixtures";
import { RunSummary } from "./run-summary";

const NONE = { wouldBlock: 0, wouldAsk: 0 };

// The value of the tile whose term is the given label.
function tile(label: string): string | null {
    return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe("RunSummary", () => {
    it("shows the agents, steps and estimated cost", () => {
        const run = makeRow({ agents: ["billing", "researcher"], steps: 1234, costUsd: 0.0062 });
        render(<RunSummary run={run} observed={NONE} />);
        expect(screen.getByLabelText("Run summary").tagName).toBe("DL");
        expect(tile("Agents")).toBe("2");
        expect(tile("Steps")).toBe("1,234");
        expect(tile("Estimated cost")).toBe("$0.0062");
    });

    it("shows a dash for the cost when a model's price is unknown", () => {
        render(<RunSummary run={makeRow({ costKnown: false })} observed={NONE} />);
        expect(tile("Estimated cost")).toBe("—");
    });

    it("shows only allowed decisions when nothing was blocked or asked", () => {
        render(<RunSummary run={makeRow({ decisions: { allowed: 3, asked: 0, blocked: 0 } })} observed={NONE} />);
        expect(tile("Guard decisions")).toBe("3allowed");
    });

    it("lists blocked, asked and observe-mode results before what was allowed", () => {
        const run = makeRow({ decisions: { allowed: 10, asked: 2, blocked: 1 } });
        render(<RunSummary run={run} observed={{ wouldBlock: 3, wouldAsk: 4 }} />);
        expect(tile("Guard decisions")).toBe("1blocked2asked3would block4would ask3allowed");
    });

    it("never counts fewer than zero allowed", () => {
        const run = makeRow({ decisions: { allowed: 1, asked: 0, blocked: 0 } });
        render(<RunSummary run={run} observed={{ wouldBlock: 2, wouldAsk: 0 }} />);
        expect(tile("Guard decisions")).toBe("2would block0allowed");
    });
});
