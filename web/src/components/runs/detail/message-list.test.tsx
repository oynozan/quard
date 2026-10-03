import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { START, UNTRUSTED, makeEdge } from "../../../../test/runs-detail-list/fixtures";
import { MessageList } from "./message-list";

describe("MessageList", () => {
    it("says there are no messages when the run has none", () => {
        render(<MessageList edges={[]} startedAt={START} />);
        expect(screen.getByText("No messages")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("folds a single message behind its count and opens it on click", () => {
        const { container } = render(<MessageList edges={[makeEdge()]} startedAt={START} />);
        const toggle = screen.getByRole("button", { name: "1 message" });
        const list = container.querySelector("ol");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(toggle.getAttribute("aria-controls")).toBe(list?.id);
        expect(list?.hidden).toBe(true);

        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(list?.hidden).toBe(false);

        fireEvent.click(toggle);
        expect(list?.hidden).toBe(true);
    });

    it("lists each message with its time, kind, agents, channel, labels and summary", () => {
        const edges = [
            makeEdge({ stepId: "a", at: START + 420 }),
            makeEdge({
                stepId: "b",
                kind: "handoff",
                from: "researcher",
                to: "writer",
                channel: "queue",
                at: START + 255_000,
                carries: [UNTRUSTED],
                summary: "Pass the draft on",
            }),
        ];
        render(<MessageList edges={edges} startedAt={START} />);
        fireEvent.click(screen.getByRole("button", { name: "2 messages" }));

        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toBe("0.42 sDelegationbillingresearcherin-processLook up the invoice sender");
        expect(items[1].textContent).toBe(
            "4 min 15 sHandoffresearcherwriterqueueweb:acme.netuntrustedPass the draft on",
        );
        expect(screen.getByText("Pass the draft on").getAttribute("title")).toBe("Pass the draft on");
    });
});
