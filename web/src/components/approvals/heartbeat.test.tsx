import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Heartbeat } from "@/lib/data/approvals";
import { MINUTE, NOW, SECOND } from "../../../test/time";
import { RequestStatus } from "./heartbeat";

const beat = (state: Heartbeat["state"], lastAt: number): Heartbeat => ({ state, lastAt });

describe("RequestStatus", () => {
    it("shows how long a live call waits and when its process last checked in", () => {
        const { container } = render(
            <RequestStatus heartbeat={beat("live", NOW - 6 * SECOND)} openedAt={NOW - 4 * MINUTE} now={NOW} />,
        );
        expect(container.textContent).toBe("Waiting 4 min · alive 6 s ago");
    });

    it("never says a live process checked in zero seconds ago", () => {
        const { container } = render(
            <RequestStatus heartbeat={beat("live", NOW)} openedAt={NOW - 4 * MINUTE} now={NOW} />,
        );
        expect(container.textContent).toBe("Waiting 4 min · alive 1 s ago");
    });

    it("shows when a stopped process went quiet and how long the request is open", () => {
        const { container } = render(
            <RequestStatus heartbeat={beat("stopped", NOW - 55 * MINUTE)} openedAt={NOW - 60 * MINUTE} now={NOW} />,
        );
        expect(container.textContent).toBe("Stopped 17:45 UTC · open 1 h");
    });
});
