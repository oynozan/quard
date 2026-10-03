import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { LIMITS } from "../../../test/summary/fleet";
import { RunLimits } from "./run-limits";

const NAMES = ["Depth", "Fan-out", "Loops", "Steps", "Cost"];

function section() {
    return screen.getByRole("region", { name: "Run limits" });
}

function tile(name: string) {
    return within(screen.getByRole("region", { name: `${name} limit` }));
}

function meterLabels(): (string | null)[] {
    return screen.getAllByRole("progressbar").map((meter) => meter.getAttribute("aria-label"));
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("RunLimits", () => {
    it("counts what observe-mode limits would stop and what block-mode limits stopped", () => {
        render(<RunLimits limits={LIMITS} />);

        expect(section().hasAttribute("aria-busy")).toBe(false);
        expect(tile("Depth").getByRole("heading", { level: 3 }).textContent).toBe("Depth");
        expect(tile("Depth").getByText("03")).toBeTruthy();
        expect(tile("Depth").getByText("would stop")).toBeTruthy();
        expect(tile("Depth").getByTitle("Limit: 3 levels").textContent).toBe("3 levels");
        expect(tile("Depth").getByRole("progressbar").getAttribute("aria-label")).toBe(
            "3 runs would stop at the depth limit in the last 30 days. The most for any limit is 6.",
        );
        expect(tile("Loops").getByText("02")).toBeTruthy();
        expect(tile("Loops").getByText("stopped")).toBeTruthy();
        expect(tile("Fan-out").getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
        expect(tile("Fan-out").getByRole("progressbar").getAttribute("aria-label")).toBe(
            "1 run would stop at the fan-out limit in the last 30 days. The most for any limit is 6.",
        );
    });

    it("keeps a limit no run went over beside the ones that were", () => {
        render(<RunLimits limits={LIMITS} />);

        expect(tile("Cost").getByText("00")).toBeTruthy();
        expect(tile("Cost").getByTitle("Limit: $5.00").textContent).toBe("$5.00");
    });

    it("keeps every tile at 00, with the meters' scale at 1, when no run went over a limit", () => {
        render(<RunLimits limits={LIMITS.map((limit) => ({ ...limit, wouldStop: 0, stopped: 0 }))} />);

        for (const name of NAMES) expect(tile(name).getByText("00")).toBeTruthy();
        expect(tile("Steps").getByRole("progressbar").getAttribute("aria-label")).toBe(
            "0 runs would stop at the steps limit in the last 30 days. The most for any limit is 1.",
        );
        expect(tile("Steps").getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    });

    it("keeps all five tiles with dashes and unlit meters when no run limit reports yet", () => {
        render(<RunLimits limits={[]} />);

        expect(section().hasAttribute("aria-busy")).toBe(false);
        expect(
            within(section())
                .getAllByRole("heading", { level: 3 })
                .map((title) => title.textContent),
        ).toEqual(NAMES);
        expect(tile("Depth").getAllByText("—")).toHaveLength(2);
        expect(tile("Depth").queryByText("would stop")).toBeNull();
        expect(meterLabels()).toEqual(
            NAMES.map((name) => `No runs counted at the ${name.toLowerCase()} limit in the last 30 days`),
        );
        expect(screen.getAllByRole("progressbar").map((meter) => meter.getAttribute("aria-valuenow"))).toEqual(
            NAMES.map(() => "0"),
        );
    });

    it("shows a loading tile for each limit while the summary loads", () => {
        render(<RunLimits limits={null} />);

        expect(section().getAttribute("aria-busy")).toBe("true");
        expect(meterLabels()).toEqual(NAMES.map((name) => `${name} limit loading`));
        expect(tile("Cost").queryByText("—")).toBeNull();
        expect(tile("Cost").queryByText("would stop")).toBeNull();
    });
});
