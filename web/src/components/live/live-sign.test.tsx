import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveCursor, LiveSign } from "./live-sign";
import { LiveStatusProvider } from "./status";

describe("LiveSign", () => {
    it("shows the green square while the stream is up", () => {
        const { container } = render(<LiveSign />);
        expect(screen.getByText("Live")).toBeTruthy();
        expect(container.querySelector(".bg-signal")).toBeTruthy();
    });

    it("turns hollow while the stream is down", () => {
        const { container } = render(
            <LiveStatusProvider value="offline">
                <LiveSign />
            </LiveStatusProvider>,
        );
        expect(screen.getByText("Offline")).toBeTruthy();
        expect(container.querySelector(".bg-signal")).toBeNull();
    });
});

describe("LiveCursor", () => {
    it("blinks while the stream is up and is gone while it is down", () => {
        const { container, rerender } = render(<LiveCursor />);
        expect(container.querySelector(".cursor-blink")).toBeTruthy();
        rerender(
            <LiveStatusProvider value="offline">
                <LiveCursor />
            </LiveStatusProvider>,
        );
        expect(container.querySelector(".cursor-blink")).toBeNull();
    });
});
