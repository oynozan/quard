import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecisionEvent } from "@/lib/data/types";
import { EventLog } from "./event-log";

const AT = Date.UTC(2026, 4, 1, 9, 30, 5);

let next = 0;

function event(outcome: DecisionEvent["outcome"], tool: string, offset = 0): DecisionEvent {
    next += 1;
    return {
        id: next.toString(16).padStart(16, "e"),
        at: AT + offset,
        agent: "planner",
        tool,
        guard: "egress",
        outcome,
        runId: "run-1",
        detail: `${tool} detail`,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("EventLog", () => {
    it("lists each decision with its time, guard, outcome, agent, tool and detail", () => {
        render(<EventLog events={[event("block", "http.get"), event("allow", "fs.read", 61_000)]} />);
        const items = screen.getAllByRole("listitem");
        expect(items.map((li) => li.textContent)).toEqual([
            "09:30:05egress blockplannerhttp.gethttp.get detail",
            "09:31:06egress allowplannerfs.readfs.read detail",
        ]);
    });

    it("keeps two decisions on one call in the same millisecond apart", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        render(<EventLog events={[event("allow", "pay"), { ...event("block", "pay"), guard: "signature" }]} />);

        const results = screen.getAllByRole("listitem").map((li) => li.children[2].textContent);
        expect(results).toEqual(["egress allow", "signature block"]);
        expect(error).not.toHaveBeenCalled();
    });

    it("colors the square by outcome: gray when let through, amber when held, red when blocked", () => {
        const outcomes: DecisionEvent["outcome"][] = ["allow", "pass", "ask", "strip", "flag", "block"];
        const { container } = render(<EventLog events={outcomes.map((o) => event(o, `tool.${o}`))} />);
        const squares = [...container.querySelectorAll("li span[aria-hidden]")].map((s) => s.className);
        expect(squares.map((c) => c.split(" ").pop())).toEqual([
            "bg-chart-context",
            "bg-chart-context",
            "bg-warning",
            "bg-warning",
            "bg-warning",
            "bg-danger",
        ]);
    });

    it("announces new lines politely and shows a blinking cursor while live", () => {
        const { container } = render(<EventLog events={[event("allow", "a")]} />);
        expect(container.firstElementChild?.getAttribute("aria-live")).toBe("polite");
        expect(container.querySelector(".cursor-blink")).toBeTruthy();
    });

    it("hides the cursor when the feed is not live", () => {
        const { container } = render(<EventLog events={[event("allow", "a")]} live={false} />);
        expect(container.querySelector(".cursor-blink")).toBeNull();
    });
});
