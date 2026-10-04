import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveStatusProvider, useLive, useLiveStatus, type LiveStatus } from "./status";

function Probe() {
    return <p>{`${useLiveStatus()} ${useLive()}`}</p>;
}

function show(status?: LiveStatus) {
    const { container } = render(
        status ? (
            <LiveStatusProvider value={status}>
                <Probe />
            </LiveStatusProvider>
        ) : (
            <Probe />
        ),
    );
    return container.textContent;
}

describe("live status", () => {
    it("counts as live until the stream drops", () => {
        expect(show()).toBe("connecting true");
        expect(show("live")).toBe("live true");
    });

    it("is not live while the stream is down", () => {
        expect(show("offline")).toBe("offline false");
    });
});
