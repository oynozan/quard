import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeLimit } from "../../../../test/runs-detail-list/fixtures";
import { RunLimits } from "./run-limits";

function rows() {
    return screen.getAllByRole("listitem").map((item) => item.textContent);
}

describe("RunLimits", () => {
    it("names each limit and shows its use against the limit with its mode", () => {
        const limits = [
            makeLimit({ name: "depth", used: 1, limit: 3, mode: "observe" }),
            makeLimit({ name: "fan-out", used: 2, limit: 4, mode: "block", unit: "agents" }),
        ];
        render(<RunLimits limits={limits} />);
        expect(screen.getByRole("region", { name: "Run limits" })).toBeTruthy();
        expect(rows()).toEqual(["Delegation depth1 / 3Observe", "Fan-out2 / 4Enforced"]);
    });

    it("draws each limit as a meter with a full spoken label", () => {
        render(<RunLimits limits={[makeLimit({ name: "steps", used: 40, limit: 200, unit: "model calls" })]} />);
        const meter = screen.getByRole("progressbar", { name: "Model calls: 40 of 200 model calls" });
        expect(meter.getAttribute("aria-valuenow")).toBe("40");
        expect(meter.getAttribute("aria-valuemax")).toBe("200");
    });

    it("writes the cost limit in dollars", () => {
        render(<RunLimits limits={[makeLimit({ name: "cost", used: 0.5, limit: 5, unit: "USD" })]} />);
        expect(rows()).toEqual(["Cost$0.50 / $5.00Observe"]);
        expect(screen.getByRole("progressbar", { name: "Cost: $0.50 of $5.00 USD" })).toBeTruthy();
    });

    it("puts passed limits first and says whether they stopped the run or only would have", () => {
        const limits = [
            makeLimit({ name: "depth" }),
            makeLimit({ name: "loops", used: 9, limit: 5, mode: "observe", over: true }),
            makeLimit({ name: "fan-out", used: 6, limit: 4, mode: "block", over: true }),
        ];
        render(<RunLimits limits={limits} />);
        expect(rows()).toEqual(["Loops9 / 5Would stop", "Fan-out6 / 4Stopped", "Delegation depth1 / 3Observe"]);
        // Only a passed limit draws its mode word in the alert color.
        const alerted = ["Would stop", "Stopped", "Observe"].map((word) =>
            screen.getByText(word).classList.contains("text-ink-alert"),
        );
        expect(alerted).toEqual([true, true, false]);
    });
});
