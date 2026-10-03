import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../../test/auth-app/browser";
import { RUN, T2, at, storedRun } from "../../../../../test/runs-fixture";
import { runDetailOf } from "@/lib/data/runs/live/detail";
import type { RunDetail } from "@/lib/data/runs/types";
import { shortId } from "@/lib/format";
import RunPage, { generateMetadata } from "./page";

const query = vi.hoisted(() => ({ getRun: vi.fn<(runId: string) => Promise<RunDetail | null>>() }));
vi.mock("@/lib/data/runs/query", () => ({ getRun: query.getRun }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: () => undefined }),
    notFound: () => {
        throw new Error("not found");
    },
}));

const props = (runId: string, step?: string) => ({
    params: Promise.resolve({ runId }),
    searchParams: Promise.resolve(step ? { step } : {}),
});

describe("RunPage", () => {
    beforeEach(() => {
        stubBrowser();
        query.getRun
            .mockReset()
            .mockImplementation(async (runId) => (runId === RUN ? runDetailOf(storedRun(), at(20).getTime()) : null));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("shows the run named in the address", async () => {
        render(await RunPage(props(RUN)));
        expect(query.getRun).toHaveBeenCalledWith(RUN);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(shortId(RUN));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens the step named in the address", async () => {
        render(await RunPage(props(RUN, T2)));
        expect(screen.getByRole("dialog").textContent).toContain("payInvoice");
    });

    it("keeps every pane for a run that has only started, with an empty timeline and no limits", async () => {
        const started = { ...storedRun(), steps: [], labels: [], decisions: [], lastEventAt: at(0) };
        query.getRun.mockResolvedValueOnce(runDetailOf(started, at(600).getTime()));
        render(await RunPage(props(RUN)));
        const timeline = screen.getByRole("region", { name: "Timeline" });
        expect(within(timeline).getByRole("button", { name: "Table" })).toBeTruthy();
        expect(within(timeline).getByRole("img", { name: "No steps yet" }).textContent).toBe("billingNo steps yet");
        expect(within(timeline).getByText("Legend:")).toBeTruthy();
        expect(screen.getByRole("region", { name: "Run graph" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "Run limits" }).textContent).toBe("Run limitsNo limits reported");
    });

    it("shows the not-found page for an id that is not 32 hex characters, without a lookup", async () => {
        await expect(RunPage(props("not-a-run"))).rejects.toThrow("not found");
        await expect(RunPage(props(RUN.toUpperCase()))).rejects.toThrow("not found");
        expect(query.getRun).not.toHaveBeenCalled();
    });

    it("shows the not-found page for a well-formed id with no run", async () => {
        await expect(RunPage(props("b".repeat(32)))).rejects.toThrow("not found");
    });

    it("titles the tab with the short run id, or says the id is wrong", async () => {
        expect(await generateMetadata(props(RUN))).toEqual({ title: `Run ${shortId(RUN)}` });
        expect(await generateMetadata(props("nope"))).toEqual({ title: "Run not found" });
    });
});
