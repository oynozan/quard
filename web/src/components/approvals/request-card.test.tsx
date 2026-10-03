import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOW } from "@/lib/data/rng";
import { openRequest } from "../../../test/approvals-overview/fixtures";
import { RequestCard } from "./request-card";

afterEach(() => {
    vi.useRealTimers();
});

describe("RequestCard", () => {
    it("names the card by its tool and shows who asked, in which run and when", async () => {
        const item = await openRequest("apr_7f31");
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        const card = screen.getByRole("article", { name: "pay_invoice" });
        expect(card.id).toBe("apr_7f31");
        expect(card.textContent).toContain("billing · run 4bf92f35 · asked 18:36 UTC · apr_7f31");
        expect(card.textContent).toContain("Waiting 4 min · alive 6 s ago");
        expect(screen.getByRole("link", { name: `Open run ${item.request.runId}` }).getAttribute("href")).toBe(
            `/runs/${item.request.runId}`,
        );
        expect(screen.getByText(item.request.reason, { selector: "p" })).toBeTruthy();
    });

    it("shows the arguments, the guard checks and the influence path", async () => {
        const item = await openRequest("apr_7f31");
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
        expect(headings).toEqual(["pay_invoice", "Arguments", "Checks", "Influence path"]);
        expect(screen.getByText("DE89 3704 0044 0532 0130 00")).toBeTruthy();
        expect(screen.getByRole("button", { name: "2 more passed" })).toBeTruthy();
        expect(screen.getByRole("list", { name: /^Influence path, 5 steps/ })).toBeTruthy();
    });

    it("leaves out the checks when no guard ran", async () => {
        const item = { ...(await openRequest("apr_7f1e")), decisions: [] };
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.queryByRole("heading", { name: "Checks" })).toBeNull();
        expect(screen.getByText(/^Stopped/).textContent).toBe("Stopped 17:53 UTC · open 52 min");
    });

    it("links the one identical call that waits on this request", async () => {
        const item = await openRequest("apr_7f2c");
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.getByText("Also covers 1 identical call")).toBeTruthy();
        const joined = item.joined[0].runId;
        expect(screen.getByRole("link", { name: `Open run ${joined}` }).textContent).toBe(joined.slice(0, 8));
    });

    it("counts several identical calls in the plural", async () => {
        const base = await openRequest("apr_7f2c");
        const item = { ...base, joined: [...base.joined, { ...base.joined[0], runId: "ab12cd34ef56" }] };
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.getByText("Also covers 2 identical calls")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Open run ab12cd34ef56" })).toBeTruthy();
    });

    it("says nothing about identical calls when there are none", async () => {
        render(<RequestCard item={await openRequest("apr_7f31")} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.queryByText(/Also covers/)).toBeNull();
    });

    it("passes the request and the answer up, and forwards its ref to the card", async () => {
        const item = await openRequest("apr_7f31");
        const onAnswer = vi.fn();
        const ref = createRef<HTMLElement>();
        vi.useFakeTimers();
        render(<RequestCard ref={ref} item={item} now={NOW} onAnswer={onAnswer} />);
        expect(ref.current).toBe(screen.getByRole("article"));
        fireEvent.click(screen.getByRole("button", { name: "Always approve" }));
        act(() => vi.advanceTimersByTime(450));
        expect(onAnswer).toHaveBeenCalledWith(item, "always approve");
    });
});
