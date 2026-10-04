// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../../test/time";
import { linksOf } from "./links";

const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000);

const delegation = (from: string, to: string, delegations: number, untrusted: number, secondsAgo: number) => ({
    from,
    to,
    delegations,
    untrusted,
    runs: 1,
    lastAt: at(secondsAgo),
});

const talk = (from: string, to: string, handoffs: number, messages: number, untrusted: number, secondsAgo: number) => ({
    from,
    to,
    handoffs,
    messages,
    delegated: 0,
    delegatedMessages: 0,
    untrusted,
    lastAt: at(secondsAgo),
});

describe("linksOf", () => {
    it("has no links without traffic", () => {
        expect(linksOf([], [])).toEqual([]);
    });

    it("keeps delegations alone as they are", () => {
        expect(linksOf([delegation("orchestrator", "billing", 3, 1, 5)], [])).toEqual([
            {
                from: "orchestrator",
                to: "billing",
                delegations: 3,
                handoffs: 0,
                messages: 0,
                total: 3,
                untrusted: 1,
                untrustedShare: 0.333,
                lastAt: NOW - 5_000,
            },
        ]);
    });

    it("adds delegations from another process to the ones made in-process", () => {
        const links = linksOf(
            [delegation("orchestrator", "billing", 2, 1, 5)],
            [
                { ...talk("orchestrator", "billing", 1, 4, 1, 9), delegated: 3, delegatedMessages: 3 },
                { ...talk("orchestrator", "support", 0, 1, 0, 2), delegated: 1, delegatedMessages: 1 },
            ],
        );

        expect(links).toEqual([
            {
                from: "orchestrator",
                to: "billing",
                delegations: 5,
                handoffs: 1,
                messages: 1,
                total: 7,
                untrusted: 2,
                untrustedShare: 0.286,
                lastAt: NOW - 5_000,
            },
            {
                from: "orchestrator",
                to: "support",
                delegations: 1,
                handoffs: 0,
                messages: 0,
                total: 1,
                untrusted: 0,
                untrustedShare: 0,
                lastAt: NOW - 2_000,
            },
        ]);
    });

    it("adds handoffs and messages to the link of the same two agents, busiest first", () => {
        const links = linksOf(
            [delegation("orchestrator", "billing", 2, 0, 5), delegation("orchestrator", "support", 1, 1, 50)],
            [
                talk("orchestrator", "support", 1, 2, 1, 40),
                // The other way round is its own link, newer than the delegations it joins
                talk("billing", "orchestrator", 0, 4, 3, 2),
                talk("orchestrator", "billing", 0, 1, 1, 9),
            ],
        );

        expect(links).toEqual([
            {
                from: "orchestrator",
                to: "support",
                delegations: 1,
                handoffs: 1,
                messages: 2,
                total: 4,
                untrusted: 2,
                untrustedShare: 0.5,
                lastAt: NOW - 40_000,
            },
            {
                from: "billing",
                to: "orchestrator",
                delegations: 0,
                handoffs: 0,
                messages: 4,
                total: 4,
                untrusted: 3,
                untrustedShare: 0.75,
                lastAt: NOW - 2_000,
            },
            {
                from: "orchestrator",
                to: "billing",
                delegations: 2,
                handoffs: 0,
                messages: 1,
                total: 3,
                untrusted: 1,
                untrustedShare: 0.333,
                lastAt: NOW - 5_000,
            },
        ]);
    });
});
