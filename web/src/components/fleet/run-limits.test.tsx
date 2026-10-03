import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoChartsOrTables } from "../../../test/empty";
import { stubBrowser } from "../../../test/fleet-shell/env";
import { LIMITS } from "../../../test/summary/fleet";
import { RunLimits } from "./run-limits";

function section() {
    return screen.getByRole("region", { name: "Run limits" });
}

function tile(name: string) {
    return within(screen.getByRole("region", { name: `${name} limit` }));
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
    });

    it("keeps a limit no run went over beside the ones that were", () => {
        render(<RunLimits limits={LIMITS} />);

        expect(tile("Cost").getByText("00")).toBeTruthy();
        expect(tile("Cost").getByTitle("Limit: $5.00").textContent).toBe("$5.00");
    });

    it("shows one line and no tiles when no run went over a limit", () => {
        render(<RunLimits limits={LIMITS.map((limit) => ({ ...limit, wouldStop: 0, stopped: 0 }))} />);

        expect(within(section()).getByRole("status").textContent).toBe("No runs over a limit in the last 30 days");
        expect(screen.queryByRole("region", { name: "Depth limit" })).toBeNull();
        expectNoChartsOrTables(section());
    });

    it("shows the same line when no run limit reports yet", () => {
        render(<RunLimits limits={[]} />);

        expect(within(section()).getByRole("heading", { level: 2 }).textContent).toBe("Run limits");
        expect(within(section()).getByRole("status").textContent).toBe("No runs over a limit in the last 30 days");
        expectNoChartsOrTables(section());
    });

    it("shows only its title and a small bar while loading, with no placeholder tiles", () => {
        render(<RunLimits limits={null} />);

        expect(section().getAttribute("aria-busy")).toBe("true");
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(screen.queryByRole("region", { name: "Depth limit" })).toBeNull();
    });
});
