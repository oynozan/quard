import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { FleetCheckFacts, QuarantinedValue } from "@/lib/data/fleet";
import { DAY, NOW } from "../../../../test/time";
import { formatShortDate } from "@/lib/format";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { CHECK, quarantined, watched } from "../../../../test/fleet-shell/quarantine";
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
const actions = vi.hoisted(() => ({ markKnown: vi.fn() }));
vi.mock("@/lib/data/fleet/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const [IBAN, DOMAIN, EMAIL] = quarantined();

// Eight values: four IBANs, three emails and one domain, enough to show the kind filter
function longList(): QuarantinedValue[] {
    const kinds = [IBAN, IBAN, IBAN, IBAN, EMAIL, EMAIL, EMAIL, DOMAIN];
    return kinds.map((row, i) => ({ ...row, key: `${row.key}-${i}`, value: `${row.value} #${i}` }));
}

function show(quarantine: QuarantinedValue[], check: FleetCheckFacts = CHECK) {
    return render(
        <>
            <QuarantineSection quarantine={quarantine} watching={watched()} check={check} now={NOW} />
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

const live = () => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite");

async function markKnown(value: string) {
    fireEvent.click(screen.getByRole("button", { name: `Mark ${value} as known` }));
    await act(async () => {});
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark as known" }));
    await act(async () => {});
}

beforeEach(() => {
    stubBrowser();
    vi.useFakeTimers();
    actions.markKnown.mockResolvedValue(true);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    actions.markKnown.mockReset();
    router.refresh.mockClear();
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
        let settle!: (found: boolean) => void;
        actions.markKnown.mockReturnValue(new Promise((resolve) => (settle = resolve)));
        show(quarantined());
        await markKnown(DOMAIN.value);
        expect(actions.markKnown).toHaveBeenCalledWith("domain:acme-billing.net");
        const busy = screen.getByRole("button", { name: "Marking as known…" });
        expect(busy.getAttribute("aria-busy")).toBe("true");

        await act(async () => settle(true));
        expect(listed()).toEqual([IBAN.value, EMAIL.value]);
        expect(heading().textContent).toBe("Quarantine2");
        await act(async () => vi.advanceTimersByTime(1));
        expect(screen.getByText(`${DOMAIN.value} marked as known`)).toBeTruthy();
        expect(live()?.textContent).toBe(`${DOMAIN.value} marked as known. 2 left in quarantine.`);
        expect(router.refresh).not.toHaveBeenCalled();

        // Focus returns to the heading once the drawer has closed
        await act(async () => vi.advanceTimersByTime(259));
        expect(document.activeElement).toBe(heading().parentElement);
    });

    it("keeps the value and the drawer when marking fails", async () => {
        actions.markKnown.mockRejectedValue(new Error("offline"));
        show(quarantined());
        await markKnown(IBAN.value);
        await act(async () => vi.advanceTimersByTime(1));
        expect(screen.getByText(`Could not mark ${IBAN.value} as known`)).toBeTruthy();
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Mark as known" }).getAttribute("aria-busy")).not.toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => vi.advanceTimersByTime(1000));
        expect(listed()).toHaveLength(3);
        expect(live()?.textContent).toBe("");
    });

    it("says when the value is gone already, and reloads the page", async () => {
        actions.markKnown.mockResolvedValue(false);
        show(quarantined());
        await markKnown(EMAIL.value);
        await act(async () => vi.advanceTimersByTime(1));
        expect(screen.getByText(`${EMAIL.value} is no longer in quarantine`)).toBeTruthy();
        expect(router.refresh).toHaveBeenCalledTimes(1);
        expect(listed()).toEqual([IBAN.value, DOMAIN.value]);
    });

    it("closes the drawer without changes on cancel", async () => {
        show(quarantined());
        fireEvent.click(screen.getByRole("button", { name: `Mark ${IBAN.value} as known` }));
        await act(async () => {});
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => vi.advanceTimersByTime(1000));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(listed()).toHaveLength(3);
        expect(actions.markKnown).not.toHaveBeenCalled();
    });

    it("says nothing is in quarantine once the last value is known, and names the watched fields", async () => {
        show([EMAIL]);
        await markKnown(EMAIL.value);
        expect(heading().textContent).toBe("Quarantine0");
        expect(screen.getByRole("heading", { name: "Nothing in quarantine" })).toBeTruthy();
        expect(screen.getByText("Watching the iban, to and url fields.")).toBeTruthy();
        expect(screen.getAllByRole("table")).toHaveLength(1);
    });

    it("names one watched field, and none before the check saw a value", () => {
        const { unmount } = show([], { ...CHECK, fields: ["iban"] });
        expect(screen.getByText("Watching the iban fields.")).toBeTruthy();
        unmount();
        show([], { ...CHECK, fields: [] });
        expect(screen.getByRole("heading", { name: "Nothing in quarantine" })).toBeTruthy();
        expect(screen.queryByText(/^Watching the/)).toBeNull();
    });

    it("says until when the check only observes", () => {
        const { unmount } = show(quarantined(), { ...CHECK, observeUntil: NOW + 2 * DAY });
        expect(screen.getByText("Observe mode until").textContent).toBe(
            `Observe mode until ${formatShortDate(NOW + 2 * DAY)}`,
        );
        unmount();
        show(quarantined(), { ...CHECK, observeUntil: NOW - DAY });
        expect(screen.queryByText(/Observe mode/)).toBeNull();
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
        expect(live()?.textContent).toBe("");
        expect(actions.markKnown).not.toHaveBeenCalled();
    });

    it("drops the pending focus when the section goes away", async () => {
        const view = show(quarantined());
        await markKnown(IBAN.value);
        view.unmount();
        await act(async () => vi.advanceTimersByTime(2000));
        expect(document.activeElement).toBe(document.body);
    });
});
