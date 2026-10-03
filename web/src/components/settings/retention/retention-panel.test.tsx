import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getSettings, type RetentionRow } from "@/lib/data/settings";
import { DAY, NOW } from "@/lib/data/rng";
import { RetentionPanel } from "./retention-panel";

const { retention, hashKey, detector } = await getSettings();

function keptFor(item: string): HTMLElement {
    const row = screen.getByText(item).closest("tr") as HTMLElement;
    return within(row).getAllByRole("cell")[1];
}

function detail(term: string): HTMLElement {
    return screen.getByText(term).nextElementSibling as HTMLElement;
}

describe("RetentionPanel", () => {
    it("lists what is kept and for how long, with the figure in mono", () => {
        render(<RetentionPanel retention={retention} hashKey={hashKey} detector={detector} />);
        expect(screen.getByRole("table", { name: "What Quard keeps and for how long" })).toBeTruthy();
        const runs = keptFor("Runs");
        expect(runs.textContent).toBe("30 days");
        expect(runs.querySelector(".mono")?.textContent).toBe("30");
        expect(keptFor("Runs tied to an incident").textContent).toBe("1 year");
    });

    it("writes kept-for words as they are when there is no day count", () => {
        render(<RetentionPanel retention={retention} hashKey={hashKey} detector={detector} />);
        expect(keptFor("Memory labels").textContent).toBe("Kept");
        expect(keptFor("Approval arguments").textContent).toBe("Until decided");
        expect(keptFor("Memory labels").querySelector(".mono")).toBeNull();
    });

    it("keeps a day count written in words out of the mono face", () => {
        const rows: RetentionRow[] = [{ item: "Exports", keep: "One week", days: 7, note: "" }];
        render(<RetentionPanel retention={rows} hashKey={hashKey} detector={detector} />);
        expect(keptFor("Exports").textContent).toBe("One week");
        expect(keptFor("Exports").querySelector(".mono")).toBeNull();
    });

    it("shows how sensitive values are stored and that no previous key is kept", () => {
        render(<RetentionPanel retention={retention} hashKey={hashKey} detector={detector} />);
        expect(screen.getByRole("heading", { level: 2, name: "Redaction" })).toBeTruthy();
        expect(detail("Sensitive values").textContent).toBe("IBANs, cards, emails and secrets");
        expect(detail("Stored as").textContent).toBe("HMAC-SHA-256");
        expect(detail("Hash key set").textContent).toBe("12 Aug");
        expect(detail("Hash key set").getAttribute("title")).toBe("12 August 2026 at 18:40");
        expect(detail("Previous key").textContent).toBe("None kept");
    });

    it("shows until when a previous hash key is kept", () => {
        const rotated = { ...hashKey, previousKeptUntil: NOW + 30 * DAY };
        render(<RetentionPanel retention={retention} hashKey={rotated} detector={detector} />);
        expect(detail("Previous key").textContent).toBe("until 2 Nov");
    });

    it("shows the detector model and that it only observes", () => {
        render(<RetentionPanel retention={retention} hashKey={hashKey} detector={detector} />);
        expect(screen.getByRole("heading", { level: 2, name: "Detector" })).toBeTruthy();
        expect(detail("Model").textContent).toBe("Jev");
        expect(detail("Version").textContent).toBe("jev-1.13.0");
        expect(detail("Mode").textContent).toBe("Observe only");
    });

    it("says the detector blocks when it is not in observe mode", () => {
        render(<RetentionPanel retention={retention} hashKey={hashKey} detector={{ ...detector, mode: "block" }} />);
        expect(detail("Mode").textContent).toBe("Blocks");
    });
});
