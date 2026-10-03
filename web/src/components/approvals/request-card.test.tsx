import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOW } from "../../../test/time";
import {
    CONTOSO,
    DEPLOY,
    EMAIL,
    JOINED_RUN,
    PAY,
    PAY_RUN,
    openRequest,
} from "../../../test/approvals-overview/fixtures";
import { RequestCard } from "./request-card";

afterEach(() => {
    vi.useRealTimers();
});

describe("RequestCard", () => {
    it("names the card by its tool and shows who asked, in which run and when", () => {
        const item = openRequest(PAY);
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        const card = screen.getByRole("article", { name: "pay_invoice" });
        expect(card.id).toBe(PAY);
        expect(card.textContent).toContain(`billing · run 4bf92f35 · asked 18:36 UTC · ${PAY}`);
        expect(card.textContent).toContain("Waiting 4 min · alive 6 s ago");
        expect(screen.getByRole("link", { name: `Open run ${PAY_RUN}` }).getAttribute("href")).toBe(`/runs/${PAY_RUN}`);
        expect(screen.getByText(item.request.reason, { selector: "p" })).toBeTruthy();
    });

    it("shows the arguments, the guard checks and the influence path", () => {
        render(<RequestCard item={openRequest(PAY)} now={NOW} onAnswer={vi.fn()} />);
        const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
        expect(headings).toEqual(["pay_invoice", "Arguments", "Checks", "Influence path"]);
        expect(screen.getByText("DE89 3704 0044 0532 0130 00")).toBeTruthy();
        expect(screen.getByRole("button", { name: "2 more passed" })).toBeTruthy();
        expect(screen.getByRole("list", { name: /^Influence path, 5 steps/ })).toBeTruthy();
    });

    it("leaves out the checks when no guard ran", () => {
        const item = { ...openRequest(DEPLOY), decisions: [] };
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.queryByRole("heading", { name: "Checks" })).toBeNull();
        expect(screen.getByText(/^Stopped/).textContent).toBe("Stopped 17:53 UTC · open 52 min");
    });

    it("says so while the run that asked has not arrived", () => {
        render(<RequestCard item={openRequest(CONTOSO)} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.getByRole("heading", { level: 3, name: "Influence path" })).toBeTruthy();
        expect(screen.queryByRole("list", { name: /^Influence path/ })).toBeNull();
        expect(screen.getByText("The run has not arrived yet.")).toBeTruthy();
    });

    it("links the one identical call that waits on this request", () => {
        render(<RequestCard item={openRequest(EMAIL)} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.getByText("Also covers 1 identical call")).toBeTruthy();
        expect(screen.getByRole("link", { name: `Open run ${JOINED_RUN}` }).textContent).toBe(JOINED_RUN.slice(0, 8));
    });

    it("counts several identical calls in the plural, even two from one run", () => {
        const base = openRequest(EMAIL);
        const item = { ...base, joined: [...base.joined, { ...base.joined[0], stepId: "f60718293a4b5c6d" }] };
        render(<RequestCard item={item} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.getByText("Also covers 2 identical calls")).toBeTruthy();
        expect(screen.getAllByRole("link", { name: `Open run ${JOINED_RUN}` })).toHaveLength(2);
    });

    it("says nothing about identical calls when there are none", () => {
        render(<RequestCard item={openRequest(PAY)} now={NOW} onAnswer={vi.fn()} />);
        expect(screen.queryByText(/Also covers/)).toBeNull();
    });

    it("passes the request and the answer up, and forwards its ref to the card", () => {
        const item = openRequest(PAY);
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
