import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunsFilter } from "./lib/params";
import { RunsBrowser } from "./runs-browser";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const EMPTY: RunsFilter = { q: "", agent: "", status: "" };
const AGENTS = ["billing", "researcher"];

function show(filter: Partial<RunsFilter> = {}) {
    return render(
        <RunsBrowser filter={{ ...EMPTY, ...filter }} agents={AGENTS}>
            <p>The runs table</p>
        </RunsBrowser>,
    );
}

function search(): HTMLInputElement {
    return screen.getByRole("searchbox", { name: "Search runs" }) as HTMLInputElement;
}

// Opens a select and picks an option with the keyboard.
async function choose(select: string, option: string) {
    await act(async () => fireEvent.click(screen.getByRole("combobox", { name: select })));
    const item = screen.getByRole("option", { name: option });
    item.focus();
    await act(async () => fireEvent.keyDown(item, { key: "Enter" }));
}

function optionNames(): (string | null)[] {
    return screen.getAllByRole("option").map((item) => item.textContent);
}

beforeEach(() => {
    router.replace.mockReset();
    router.refresh.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("RunsBrowser", () => {
    it("shows the search, both filters, the color key, refresh and the table", () => {
        show();
        expect(search().value).toBe("");
        expect(screen.getByRole("combobox", { name: "Filter by agent" }).textContent).toContain("All agents");
        expect(screen.getByRole("combobox", { name: "Filter by status" }).textContent).toContain("All statuses");
        expect(screen.getByRole("list", { name: "Guard decision colors" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Refresh runs" })).toBeTruthy();
        expect(screen.getByText("The runs table")).toBeTruthy();
    });

    it("searches a short moment after typing stops, trimming the words", () => {
        vi.useFakeTimers();
        show({ status: "failed" });
        fireEvent.change(search(), { target: { value: "pay" } });
        act(() => vi.advanceTimersByTime(100));
        fireEvent.change(search(), { target: { value: " payInvoice " } });
        act(() => vi.advanceTimersByTime(249));
        expect(router.replace).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(search().value).toBe(" payInvoice ");
        expect(router.replace).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenCalledWith("/runs?q=payInvoice&status=failed", { scroll: false });
    });

    it("searches at once on Enter and ignores other keys", () => {
        vi.useFakeTimers();
        show();
        fireEvent.keyDown(search(), { key: "a" });
        expect(router.replace).not.toHaveBeenCalled();

        fireEvent.keyDown(search(), { key: "Enter" });
        expect(router.replace).toHaveBeenCalledWith("/runs", { scroll: false });

        fireEvent.change(search(), { target: { value: "billing" } });
        fireEvent.keyDown(search(), { key: "Enter" });
        expect(router.replace).toHaveBeenLastCalledWith("/runs?q=billing", { scroll: false });
        act(() => vi.advanceTimersByTime(1000));
        expect(router.replace).toHaveBeenCalledTimes(2);
    });

    it("drops a waiting search when the page goes away", () => {
        vi.useFakeTimers();
        const { unmount } = show();
        fireEvent.change(search(), { target: { value: "billing" } });
        unmount();
        act(() => vi.advanceTimersByTime(1000));
        expect(router.replace).not.toHaveBeenCalled();
    });

    it("filters by agent and keeps the typed search", async () => {
        show();
        fireEvent.change(search(), { target: { value: "  iban " } });
        await choose("Filter by agent", "researcher");
        expect(router.replace).toHaveBeenCalledWith("/runs?q=iban&agent=researcher", { scroll: false });
    });

    it("clears the agent filter with All agents", async () => {
        show({ agent: "billing" });
        expect(screen.getByRole("combobox", { name: "Filter by agent" }).textContent).toContain("billing");
        await choose("Filter by agent", "All agents");
        expect(router.replace).toHaveBeenCalledWith("/runs", { scroll: false });
    });

    it("keeps an agent from a shared link that this workspace no longer has", async () => {
        show({ agent: "retired-bot" });
        await act(async () => fireEvent.click(screen.getByRole("combobox", { name: "Filter by agent" })));
        expect(optionNames()).toEqual(["All agents", "billing", "researcher", "retired-bot"]);
    });

    it("lists only the workspace's agents when the filter names one of them", async () => {
        show({ agent: "researcher" });
        await act(async () => fireEvent.click(screen.getByRole("combobox", { name: "Filter by agent" })));
        expect(optionNames()).toEqual(["All agents", "billing", "researcher"]);
    });

    it("filters by status and clears it with All statuses", async () => {
        const { unmount } = show({ agent: "billing" });
        await choose("Filter by status", "Blocked");
        expect(router.replace).toHaveBeenCalledWith("/runs?agent=billing&status=blocked", { scroll: false });
        unmount();

        show({ status: "blocked" });
        await choose("Filter by status", "All statuses");
        expect(router.replace).toHaveBeenLastCalledWith("/runs", { scroll: false });
    });

    it("refreshes the runs from the server", () => {
        show();
        fireEvent.click(screen.getByRole("button", { name: "Refresh runs" }));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("follows a search the URL changed by itself, like going back", () => {
        const { rerender } = show({ q: "billing" });
        expect(search().value).toBe("billing");
        rerender(
            <RunsBrowser filter={{ ...EMPTY }} agents={AGENTS}>
                <p>The runs table</p>
            </RunsBrowser>,
        );
        expect(search().value).toBe("");
    });

    it("keeps what the person typed when the URL catches up with their own search", () => {
        vi.useFakeTimers();
        const { rerender } = show();
        fireEvent.change(search(), { target: { value: "pay " } });
        act(() => vi.advanceTimersByTime(250));
        expect(router.replace).toHaveBeenCalledWith("/runs?q=pay", { scroll: false });

        rerender(
            <RunsBrowser filter={{ ...EMPTY, q: "pay" }} agents={AGENTS}>
                <p>The runs table</p>
            </RunsBrowser>,
        );
        expect(search().value).toBe("pay ");
    });
});
