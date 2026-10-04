import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeLink, READY } from "../../test/fake-socket.ts";
import { createFleetState } from "./quarantine.ts";

const IBAN_KEY = `iban:DE89…3000#${"e".repeat(32)}`;
const UNTIL = "2026-10-10T00:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

// A long silence limit stands in for control's pings
function setup() {
    const { fake, link } = fakeLink({ silentMs: 10 * DAY });
    return { fake, link, fleet: createFleetState(link, DAY) };
}

beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00.000Z") });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("the synced quarantine list", () => {
    it("takes the list and the observe window from ready", () => {
        const { fake, fleet } = setup();

        fake.connect({ ...READY, quarantine: [{ key: IBAN_KEY, observe: true }], fleetObserveUntil: UNTIL });

        expect(fleet.entry(IBAN_KEY, Date.now())).toEqual({ key: IBAN_KEY, observe: true });
        expect(fleet.entry("domain:other.com", Date.now())).toBeUndefined();
        expect(fleet.pastObserve(Date.parse(UNTIL))).toBe(false);
        expect(fleet.pastObserve(Date.parse(UNTIL) + 1)).toBe(true);
    });

    it("counts the observe window as over when the fleet check has none", () => {
        const { fake, fleet } = setup();

        fake.connect();

        expect(fleet.pastObserve(0)).toBe(true);
    });

    it("applies pushes and fleet results, and replaces the list on each ready", () => {
        const { fake, fleet } = setup();
        const socket = fake.connect({ ...READY, quarantine: [{ key: "domain:old.com", observe: false }] });

        socket.reply({ type: "quarantine", add: [{ key: IBAN_KEY, observe: false }], remove: ["domain:old.com"] });
        socket.reply({
            type: "fleet_result",
            id: "1".repeat(16),
            quarantined: [{ key: "domain:evil.com", observe: true }],
            fleetObserveUntil: UNTIL,
        });

        expect(fleet.entry("domain:old.com", Date.now())).toBeUndefined();
        expect(fleet.entry(IBAN_KEY, Date.now())?.observe).toBe(false);
        expect(fleet.entry("domain:evil.com", Date.now())?.observe).toBe(true);
        expect(fleet.pastObserve(Date.now())).toBe(false);
        socket.reply({ type: "counted", id: "1".repeat(16), ok: true, used: [1] });

        socket.drop();
        vi.advanceTimersByTime(1000);
        fake.connect();
        expect(fleet.entry(IBAN_KEY, Date.now())).toBeUndefined();
    });

    it("keeps using the list for a day while control is away, then drops it", () => {
        const { fake, fleet } = setup();
        fake.connect({ ...READY, quarantine: [{ key: IBAN_KEY, observe: false }] });
        vi.advanceTimersByTime(3 * DAY);
        expect(fleet.entry(IBAN_KEY, Date.now())).toBeDefined();

        fake.last().drop();

        expect(fleet.entry(IBAN_KEY, Date.now() + DAY)).toBeDefined();
        expect(fleet.entry(IBAN_KEY, Date.now() + DAY + 1)).toBeUndefined();
        expect(fleet.entry(IBAN_KEY, Date.now())).toBeUndefined();
    });
});
