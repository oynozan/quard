import { redactText } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { clearVersions, knownVersions, rememberVersion, versionOf, type AgentVersion } from "./versions.ts";

afterEach(() => {
    clearVersions();
});

const entry = (agent: string, version: string): AgentVersion => ({
    agent,
    version,
    model: "gpt-test",
    tools: [],
    instructions: undefined,
});

describe("agent versions", () => {
    it("hash the model, instructions and tool names, whatever the tool order", () => {
        const version = versionOf("gpt-test", "Be brief", ["payInvoice", "fetchPage"]);

        expect(version).toMatch(/^[0-9a-f]{16}$/);
        expect(versionOf("gpt-test", "Be brief", ["fetchPage", "payInvoice"])).toBe(version);
        expect(versionOf("gpt-test", "Be kind", ["fetchPage", "payInvoice"])).not.toBe(version);
        expect(versionOf("gpt-test", undefined, [])).not.toBe(versionOf("gpt-test", "", []));
    });

    it("hash the instructions as control stores them, with emails masked", () => {
        const version = versionOf("gpt-test", "Mail jane@acme.com", []);

        expect(version).toBe(versionOf("gpt-test", redactText("Mail jane@acme.com"), []));
        expect(version).toBe(versionOf("gpt-test", "Mail jxyz@acme.com", []));
    });

    it("are new once per agent and version", () => {
        expect(rememberVersion(entry("billing", "a"))).toBe(true);
        expect(rememberVersion(entry("billing", "a"))).toBe(false);
        expect(rememberVersion(entry("support", "a"))).toBe(true);

        expect(knownVersions().map((known) => known.agent)).toEqual(["billing", "support"]);
    });

    it("keep only the newest 100", () => {
        for (let n = 0; n < 101; n++) {
            rememberVersion(entry("billing", String(n)));
        }

        expect(knownVersions()).toHaveLength(100);
        expect(knownVersions()[0]?.version).toBe("1");
    });
});
