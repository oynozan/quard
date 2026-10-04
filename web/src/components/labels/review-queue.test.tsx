import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { reviewChunk, taxNotice } from "../../../test/labels/chunks";
import { NOW } from "../../../test/time";
import { ReviewQueue } from "./review-queue";

const actions = vi.hoisted(() => ({ reviewLabel: vi.fn() }));
vi.mock("@/lib/data/content-labels/actions", () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The real drawer, with its last save handler kept so a test can call it directly
const drawer = vi.hoisted(() => ({ onSave: (() => {}) as (label: string) => void }));
vi.mock("./review-drawer", async (importOriginal) => {
    const real = await importOriginal<typeof import("./review-drawer")>();
    return {
        ReviewDrawer: (props: Parameters<typeof real.ReviewDrawer>[0]) => {
            drawer.onSave = props.onSave;
            return <real.ReviewDrawer {...props} />;
        },
    };
});

afterEach(() => {
    actions.reviewLabel.mockReset();
    router.refresh.mockClear();
});

function show(queue = [reviewChunk(), taxNotice()], open = 2) {
    return render(
        <>
            <ReviewQueue queue={queue} open={open} now={NOW} />
            <Toaster />
        </>,
    );
}

const heading = () => screen.getByRole("heading", { level: 2, name: /^To review/, hidden: true }).textContent;

async function approve(origin: string, label: string) {
    fireEvent.click(screen.getByRole("button", { name: `Review the chunk from ${origin}` }));
    await act(async () => {});
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: `Approve ${label}` }));
    await act(async () => {});
}

describe("ReviewQueue", () => {
    it("keeps the table drawn when nothing waits", () => {
        show([], 0);
        expect(heading()).toBe("To review0");
        expect(screen.getByRole("table")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Nothing to review" })).toBeTruthy();
    });

    it("saves the approved label, takes the chunk off the list and reloads the page", async () => {
        actions.reviewLabel.mockResolvedValue(true);
        show();

        await approve("web:tax.example", "tax_notice");

        expect(actions.reviewLabel).toHaveBeenCalledWith("b".repeat(16), "tax_notice");
        expect(heading()).toBe("To review1");
        expect(screen.queryByText("Your 2026 tax return is due.")).toBeNull();
        expect(router.refresh).toHaveBeenCalled();
        expect(await screen.findByText("Saved as tax_notice")).toBeTruthy();
    });

    it("says when the chunk was already gone", async () => {
        actions.reviewLabel.mockResolvedValue(false);
        show();

        await approve("email:b…@acme-billing.net", "payment_fraud");

        expect(await screen.findByText("That chunk is gone")).toBeTruthy();
    });

    it("keeps the chunk and says so when saving fails", async () => {
        actions.reviewLabel.mockRejectedValue(new Error("down"));
        show();

        await approve("web:tax.example", "tax_notice");

        expect(await screen.findByText("Could not save the label")).toBeTruthy();
        expect(heading()).toBe("To review2");
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("closes the drawer from Cancel without saving", async () => {
        show();
        fireEvent.click(screen.getByRole("button", { name: "Review the chunk from web:tax.example" }));
        await act(async () => {});
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
        await act(async () => {});
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(actions.reviewLabel).not.toHaveBeenCalled();
    });

    it("does nothing when asked to save before a chunk is picked", async () => {
        show();
        await act(async () => drawer.onSave("invoice"));
        expect(actions.reviewLabel).not.toHaveBeenCalled();
    });
});
