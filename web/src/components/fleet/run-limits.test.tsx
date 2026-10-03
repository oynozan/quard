import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunLimitCount } from "@/lib/data/fleet";
import { sampleFleet, stubBrowser } from "../../../test/fleet-shell/env";
import { RunLimits } from "./run-limits";

function tile(name: string) {
    return within(screen.getByRole("region", { name: `${name} limit` }));
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("RunLimits", () => {
    it("counts what observe-mode limits would stop and what block-mode limits stopped", async () => {
        const { runLimits } = await sampleFleet();
        render(<RunLimits limits={runLimits} />);
        expect(screen.getByRole("region", { name: "Run limits" }).hasAttribute("aria-busy")).toBe(false);

        expect(tile("Depth").getByRole("heading", { level: 3 }).textContent).toBe("Depth");
        expect(tile("Depth").getByText("07")).toBeTruthy();
        expect(tile("Depth").getByText("would stop")).toBeTruthy();
        expect(tile("Depth").getByTitle("Limit: 3 levels").textContent).toBe("3 levels");
        expect(tile("Depth").getByRole("progressbar").getAttribute("aria-label")).toBe(
            "7 runs would stop at the depth limit in the last 30 days. The most for any limit is 11.",
        );

        expect(tile("Loops").getByText("04")).toBeTruthy();
        expect(tile("Loops").getByText("stopped")).toBeTruthy();
        expect(tile("Cost").getByTitle("Limit: $5.00").textContent).toBe("$5.00");
        expect(tile("Fan-out").getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    });

    it("keeps the meters' scale at 1 when no run went over a limit", () => {
        const quiet: RunLimitCount[] = [
            { name: "steps", limit: 200, unit: "model calls", mode: "block", wouldStop: 9, stopped: 0 },
        ];
        render(<RunLimits limits={quiet} />);
        expect(tile("Steps").getByText("00")).toBeTruthy();
        expect(tile("Steps").getByRole("progressbar").getAttribute("aria-label")).toBe(
            "0 runs stopped at the steps limit in the last 30 days. The most for any limit is 1.",
        );
    });

    it("titles a limit that arrives without a name as Depth, the first limit", () => {
        const nameless = { limit: 3, unit: "levels", mode: "observe", wouldStop: 1, stopped: 0 } as RunLimitCount;
        render(<RunLimits limits={[nameless]} />);
        expect(tile("Depth").getByText("01")).toBeTruthy();
    });

    it("shows a placeholder tile for each limit while loading", () => {
        render(<RunLimits limits={null} />);
        expect(screen.getByRole("region", { name: "Run limits" }).getAttribute("aria-busy")).toBe("true");
        const meters = screen.getAllByRole("progressbar").map((meter) => meter.getAttribute("aria-label"));
        expect(meters).toEqual([
            "Depth limit loading",
            "Fan-out limit loading",
            "Loops limit loading",
            "Steps limit loading",
            "Cost limit loading",
        ]);
        expect(tile("Cost").queryByText("would stop")).toBeNull();
    });
});
