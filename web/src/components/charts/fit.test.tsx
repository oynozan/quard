import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeResizeObserver, observers, resizeAll } from "../../../test/charts-rest/dom";
import { FitMeter, FitSparkline } from "./fit";

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("FitMeter", () => {
    it("starts at 220px wide and then spans its container", () => {
        render(<FitMeter value={3} max={10} cells={10} label="Budget" />);
        const meter = screen.getByRole("progressbar", { name: "Budget" });
        expect(meter.getAttribute("width")).toBe("220");
        expect(meter.getAttribute("aria-valuenow")).toBe("3");
        resizeAll(300.6);
        expect(meter.getAttribute("width")).toBe("300");
    });

    it("starts from the given width", () => {
        render(<FitMeter value={3} max={10} cells={10} label="Budget" initial={140} />);
        expect(screen.getByRole("progressbar").getAttribute("width")).toBe("140");
    });
});

describe("FitSparkline", () => {
    it("starts at 220px wide and then spans its container", () => {
        render(<FitSparkline values={[1, 2, 3]} rows={4} cell={4} label="Calls" />);
        const chart = screen.getByRole("img", { name: "Calls" });
        expect(chart.getAttribute("width")).toBe("220");
        resizeAll(160);
        expect(chart.getAttribute("width")).toBe("160");
    });

    it("starts from the given width", () => {
        render(<FitSparkline values={[1, 2, 3]} rows={4} cell={4} label="Calls" initial={100} />);
        expect(screen.getByRole("img").getAttribute("width")).toBe("100");
    });
});
