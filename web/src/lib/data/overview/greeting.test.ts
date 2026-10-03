// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../test/time";
import { greetingFor } from "./greeting";

const at = (hour: number, minute = 0) => Date.UTC(2026, 9, 3, hour, minute);

describe("greetingFor", () => {
    it("names the part of the day by the UTC hour", () => {
        expect(greetingFor(at(0), 2)).toBe("Good morning. 2 agents are running.");
        expect(greetingFor(at(11, 59), 2)).toBe("Good morning. 2 agents are running.");
        expect(greetingFor(at(12), 2)).toBe("Good afternoon. 2 agents are running.");
        expect(greetingFor(at(17, 59), 2)).toBe("Good afternoon. 2 agents are running.");
        expect(greetingFor(at(18), 2)).toBe("Good evening. 2 agents are running.");
        expect(greetingFor(at(23, 59), 2)).toBe("Good evening. 2 agents are running.");
    });

    it("says how many agents are running in words", () => {
        expect(greetingFor(NOW, 0)).toBe("Good evening. No agents are running.");
        expect(greetingFor(NOW, 1)).toBe("Good evening. One agent is running.");
        expect(greetingFor(NOW, 12)).toBe("Good evening. 12 agents are running.");
    });

    it("is only the greeting on a new install, which has no agents to count", () => {
        expect(greetingFor(NOW)).toBe("Good evening.");
    });
});
