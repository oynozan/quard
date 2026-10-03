import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalsLayout from "./layout";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 204 })),
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    router.refresh.mockClear();
});

describe("ApprovalsLayout", () => {
    it("shows the page and keeps its data fresh every 5 seconds", async () => {
        render(await ApprovalsLayout({ params: Promise.resolve({}), children: <h1>Approvals</h1> }));
        expect(screen.getByRole("heading", { name: "Approvals" })).toBeTruthy();

        await act(async () => vi.advanceTimersByTime(5000));
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });
});
