import { labelFor, type Label } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../core/config.ts";
import { newScope, type Scope } from "../context/scope.ts";
import { resetAll } from "../test/reset.ts";
import { briefLabel, markBrief } from "./agent-brief.ts";

const KNOWN = "DE89370400440532013000";
const MADE_UP = "GB82WEST12345698765432";
const BRIEF = `Pay ${KNOWN}, then ${MADE_UP}.`;

afterEach(() => {
    resetAll();
});

// A frame whose run read the given content before the call
function frameAfter(...read: Array<[string, Label]>): Scope {
    const frame = newScope({ agent: "billing" });
    read.forEach(([text, label], i) => frame.run.index.add(text, label, `s${i}`));
    markBrief(frame, "orchestrator");
    return frame;
}

function origins(scope: Scope, iban: string): string[] {
    return scope.run.index.lookup([`iban:${iban}`]).map((o) => o.origin);
}

describe("briefLabel", () => {
    it("gives no label to user input outside a brief", () => {
        expect(briefLabel(newScope(), BRIEF)).toBeUndefined();
    });

    it("labels a brief as the caller's words, with the run's context label", () => {
        const frame = frameAfter([`IBAN ${KNOWN}`, labelFor("tool:crm")]);

        expect(briefLabel(frame, BRIEF)).toEqual({
            origin: "agent:orchestrator",
            kind: "agent",
            trust: "trusted",
            sensitivity: "internal",
            flags: [],
        });
    });

    it("keeps a trusted brief's new values model-generated", () => {
        const frame = frameAfter([`IBAN ${KNOWN}`, labelFor("tool:crm")]);

        const label = briefLabel(frame, BRIEF) as Label;
        frame.run.index.add(BRIEF, label, "s9", { keepEarlier: true });
        frame.run.index.add(`IBAN ${MADE_UP}`, labelFor("tool:readNote"), "s10");

        expect(origins(frame, KNOWN)).toEqual(["tool:crm"]);
        expect(origins(frame, MADE_UP)).toEqual([]);
    });

    it("gives an untrusted brief's new values its label", () => {
        const frame = frameAfter([`page ${KNOWN}`, labelFor("web:evil.com", {}, ["injection"])]);

        const label = briefLabel(frame, BRIEF) as Label;
        frame.run.index.add(BRIEF, label, "s9", { keepEarlier: true });

        expect(label).toMatchObject({ trust: "untrusted", sensitivity: "public", flags: ["flagged"] });
        expect(origins(frame, MADE_UP)).toEqual(["agent:orchestrator"]);
    });

    it("lets a team's override for the caller win", () => {
        configure({ origins: { "agent:orchestrator": { trust: "untrusted" } } });
        const frame = frameAfter([`IBAN ${KNOWN}`, labelFor("tool:crm")]);

        expect(briefLabel(frame, BRIEF)).toMatchObject({ trust: "untrusted", sensitivity: "internal" });
    });
});
