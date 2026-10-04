import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkSeen } from "./mark-seen";

// A plain function, since a vi.fn handles every promise it returns
const action = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
vi.mock("@/lib/data/incidents/actions", () => ({
    markIncidentSeen: async (id: string) => {
        action.calls.push(id);
        if (action.fail) throw new Error("The server is down");
    },
}));

const ID = "inc_0123456789abcdef";

afterEach(() => {
    action.calls = [];
    action.fail = false;
});

describe("MarkSeen", () => {
    it("marks the incident as seen once, however often the page renders, and draws nothing", async () => {
        const { container, rerender } = render(<MarkSeen id={ID} />);
        rerender(<MarkSeen id={ID} />);
        await act(async () => {});
        expect(action.calls).toEqual([ID]);
        expect(container.innerHTML).toBe("");
    });

    it("stays quiet when the mark fails", async () => {
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        try {
            action.fail = true;
            const { container } = render(<MarkSeen id={ID} />);
            await act(async () => {});
            // Node reports a rejection nobody handled once the current task ends
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(action.calls).toEqual([ID]);
            expect(container.innerHTML).toBe("");
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off("unhandledRejection", unhandled);
        }
    });
});
