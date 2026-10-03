import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { expectNoChartsOrTables } from "../../../../test/empty";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { QUARANTINE, WATCHING } from "../../../../test/summary/fleet";
import { NOW } from "../../../../test/time";
import { QuarantineSection } from "./quarantine-section";

const [IBAN, DOMAIN, EMAIL] = QUARANTINE;

// Copies of one value, enough to show the kind filter
function copies(row: QuarantinedValue, count: number): QuarantinedValue[] {
    return Array.from({ length: count }, (_, i) => ({ ...row, hash: `${row.kind}-${i}`, value: `${row.value} #${i}` }));
}

function section() {
    return screen.getByRole("region", { name: "Quarantine" });
}

function heading() {
    return within(section()).getByRole("heading", { level: 2 });
}

function listed(): string[] {
    const table = within(section()).getAllByRole("table")[0];
    return within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("strong")?.textContent ?? "");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("QuarantineSection", () => {
    it("lists a short quarantine without a kind filter, above the watching table", () => {
        render(<QuarantineSection quarantine={QUARANTINE} watching={WATCHING} now={NOW} />);

        expect(heading().textContent).toBe("Quarantine3");
        expect(screen.queryByRole("group", { name: "Value kind" })).toBeNull();
        expect(listed()).toEqual([IBAN.value, DOMAIN.value, EMAIL.value]);
        expect(screen.getByRole("heading", { level: 3, name: "Watching" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /known/ })).toBeNull();
    });

    it("filters a long list by kind, offering only the kinds it holds", () => {
        render(<QuarantineSection quarantine={[...copies(IBAN, 4), ...copies(EMAIL, 3)]} watching={[]} now={NOW} />);
        const filter = screen.getByRole("group", { name: "Value kind" });

        expect(
            within(filter)
                .getAllByRole("button")
                .map((button) => button.textContent),
        ).toEqual(["All7", "IBAN4", "Email3"]);
        fireEvent.click(within(filter).getByRole("button", { name: "Email3" }));
        expect(listed()).toEqual([`${EMAIL.value} #0`, `${EMAIL.value} #1`, `${EMAIL.value} #2`]);
        fireEvent.click(within(filter).getByRole("button", { name: "All7" }));
        expect(listed()).toHaveLength(7);
        expect(screen.queryByRole("heading", { name: "Watching" })).toBeNull();
    });

    it("shows every value again when the picked kind is no longer held", () => {
        const { rerender } = render(
            <QuarantineSection quarantine={[...copies(IBAN, 4), ...copies(EMAIL, 3)]} watching={[]} now={NOW} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Email3" }));

        rerender(<QuarantineSection quarantine={copies(IBAN, 7)} watching={[]} now={NOW} />);

        expect(screen.getByRole("button", { name: "All7" }).getAttribute("aria-pressed")).toBe("true");
        expect(listed()).toHaveLength(7);
    });

    it("says nothing is in quarantine above the values it is still watching", () => {
        render(<QuarantineSection quarantine={[]} watching={WATCHING} now={NOW} />);

        expect(heading().textContent).toBe("Quarantine");
        expect(within(section()).getByRole("status").textContent).toBe("Nothing in quarantine");
        expect(within(section()).getAllByRole("table")).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 3, name: "Watching" })).toBeTruthy();
    });

    it("shows one line and no tables when nothing is quarantined or watched", () => {
        render(<QuarantineSection quarantine={[]} watching={[]} now={NOW} />);

        expect(heading().textContent).toBe("Quarantine");
        expect(within(section()).getByRole("status").textContent).toBe("Nothing in quarantine");
        expectNoChartsOrTables(section());
    });
});
