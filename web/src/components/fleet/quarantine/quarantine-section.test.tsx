import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { QuarantinedValue } from "@/lib/data/fleet";
import { quarantined, watched } from "@/lib/data/fleet/quarantine";
import { NOW } from "@/lib/data/rng";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { QuarantineSection } from "./quarantine-section";

// The real drawer, with its last confirm handler kept so a test can call it directly
const drawer = vi.hoisted(() => ({ onConfirm: () => {} }));
vi.mock("./mark-known-drawer", async (importOriginal) => {
    const real = await importOriginal<typeof import("./mark-known-drawer")>();
    return {
        MarkKnownDrawer: (props: Parameters<typeof real.MarkKnownDrawer>[0]) => {
            drawer.onConfirm = props.onConfirm;
            return <real.MarkKnownDrawer {...props} />;
        },
    };
});

const CHECK = { fields: ["iban", "to", "url"], newForDays: 7, runsToBlock: 5, withinHours: 24, observeUntil: null };
const [IBAN, DOMAIN, EMAIL] = quarantined();

// Eight values: four IBANs, three emails and one domain, enough to show the kind filter
function longList(): QuarantinedValue[] {
    const kinds = [IBAN, IBAN, IBAN, IBAN, EMAIL, EMAIL, EMAIL, DOMAIN];
    return kinds.map((row, i) => ({ ...row, hash: `hash-${i}`, value: `${row.value} #${i}` }));
}

function show(quarantine: QuarantinedValue[]) {
    return render(
        <>
            <QuarantineSection quarantine={quarantine} watching={watched()} check={CHECK} now={NOW} />
            <Toaster />
        </>,
    );
}

function heading() {
    return screen.getByRole("heading", { level: 2 });
}

function listed(): string[] {
    const table = screen.getAllByRole("table")[0];
    return within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.querySelector("strong")?.textContent ?? "");
}

async function markKnown(value: string) {
    fireEvent.click(screen.getByRole("button", { name: `Mark ${value} as known` }));
    await act(async () => {});
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as known" }));
    await act(async () => {});
}

beforeEach(() => {
    stubBrowser();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("QuarantineSection", () => {
    it("lists a short quarantine without a kind filter, beside the watching table", () => {
        show(quarantined());
        expect(heading().textContent).toBe("Quarantine3");
        expect(screen.queryByRole("group", { name: "Value kind" })).toBeNull();
        expect(listed()).toEqual([IBAN.value, DOMAIN.value, EMAIL.value]);
        expect(screen.getByRole("heading", { name: "Watching" })).toBeTruthy();
    });

    it("marks a value as known after the drawer confirms, then reports it", async () => {
        show(quarantined());
        await markKnown(DOMAIN.value);
        const busy = screen.getByRole("button", { name: "Marking as known…" });
        expect(busy.getAttribute("aria-busy")).toBe("true");

        await act(async () => vi.advanceTimersByTime(650));
        expect(listed()).toEqual([IBAN.value, EMAIL.value]);
        expect(heading().textContent).toBe("Quarantine2");
        await act(async () => vi.advanceTimersByTime(1));
        expect(screen.getByText(`${DOMAIN.value} marked as known`)).toBeTruthy();
        const live = screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite");
        expect(live?.textContent).toBe(`${DOMAIN.value} marked as known. 2 left in quarantine.`);

        // Focus returns to the heading once the drawer has closed
        await act(async () => vi.advanceTimersByTime(259));
        expect(document.activeElement).toBe(heading().parentElement);
    });

    it("closes the drawer without changes on cancel", async () => {
        show(quarantined());
        fireEvent.click(screen.getByRole("button", { name: `Mark ${IBAN.value} as known` }));
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => vi.advanceTimersByTime(1000));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(listed()).toHaveLength(3);
    });

    it("says nothing is in quarantine once the last value is known", async () => {
        show([EMAIL]);
        await markKnown(EMAIL.value);
        await act(async () => vi.advanceTimersByTime(650));
        expect(heading().textContent).toBe("Quarantine0");
        expect(screen.getByRole("heading", { name: "Nothing in quarantine" })).toBeTruthy();
        expect(screen.getAllByRole("table")).toHaveLength(1);
    });

    it("filters a long list by kind, with a count per kind", () => {
        show(longList());
        const filter = screen.getByRole("group", { name: "Value kind" });
        const labels = within(filter)
            .getAllByRole("button")
            .map((button) => button.textContent);
        expect(labels).toEqual(["All8", "IBAN4", "Email3", "Domain1"]);

        fireEvent.click(within(filter).getByRole("button", { name: "Email3" }));
        expect(listed()).toEqual([`${EMAIL.value} #4`, `${EMAIL.value} #5`, `${EMAIL.value} #6`]);
        fireEvent.click(within(filter).getByRole("button", { name: "All8" }));
        expect(listed()).toHaveLength(8);
    });

    it("offers to show all when the picked kind runs out", async () => {
        show(longList());
        fireEvent.click(screen.getByRole("button", { name: "Domain1" }));
        await markKnown(`${DOMAIN.value} #7`);
        await act(async () => vi.advanceTimersByTime(650));

        expect(screen.getByRole("heading", { name: "No quarantined domains" })).toBeTruthy();
        expect(screen.getAllByRole("table")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Show all" }));
        expect(listed()).toHaveLength(7);
    });

    it("ignores a confirm before any value was picked", async () => {
        show(quarantined());
        await act(async () => drawer.onConfirm());
        await act(async () => vi.advanceTimersByTime(2000));
        expect(listed()).toHaveLength(3);
        expect(heading().textContent).toBe("Quarantine3");
        const live = screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite");
        expect(live?.textContent).toBe("");
    });

    it("drops the pending change when the section goes away", async () => {
        const view = render(<QuarantineSection quarantine={quarantined()} watching={[]} check={CHECK} now={NOW} />);
        render(<Toaster />);
        await markKnown(IBAN.value);
        view.unmount();
        await act(async () => vi.advanceTimersByTime(2000));
        expect(screen.queryByText(`${IBAN.value} marked as known`)).toBeNull();
    });
});
