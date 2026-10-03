// @vitest-environment node
import { describe, expect, it } from "vitest";
import { agentLabel, DEFAULT_MAPPING, labelFor, ORIGIN_OVERRIDES, originKind, USER_LABEL } from "./origins";
import type { Label } from "../types";

const web: Label = { origin: "web:docs.python.org", trust: "untrusted", sensitivity: "public" };
const tool: Label = { origin: "tool:lookup_supplier", trust: "trusted", sensitivity: "internal" };
// A made-up trusted public label, since no default or override gives one
const published: Label = { origin: "mcp:docs.acme.internal", trust: "trusted", sensitivity: "public" };

describe("originKind", () => {
    it("reads the kind from the part before the first colon", () => {
        expect(originKind("web:docs.python.org")).toBe("web");
        expect(originKind("email:gmail.com")).toBe("email");
        expect(originKind("file:/srv/a:b")).toBe("file");
        expect(originKind("user")).toBe("user");
    });

    it("treats an unknown kind as unknown", () => {
        expect(originKind("ftp:files.example")).toBe("unknown");
        expect(originKind("")).toBe("unknown");
    });

    it("ignores names every object carries, such as constructor", () => {
        expect(originKind("constructor:x")).toBe("unknown");
        expect(originKind("toString")).toBe("unknown");
    });
});

describe("DEFAULT_MAPPING", () => {
    it("trusts system instructions like the SDK does", () => {
        expect(originKind("system")).toBe("system");
        expect(DEFAULT_MAPPING.system).toEqual({ trust: "trusted", sensitivity: "internal" });
    });
});

describe("labelFor", () => {
    it("uses the default mapping for the origin's kind", () => {
        expect(labelFor("web:docs.python.org")).toEqual(web);
        expect(labelFor("file:/tmp/notes.txt")).toEqual({
            origin: "file:/tmp/notes.txt",
            trust: "untrusted",
            sensitivity: "internal",
        });
        expect(labelFor("tool:lookup_supplier")).toEqual(tool);
    });

    it("labels unknown origins as untrusted internal content", () => {
        expect(labelFor("ftp:files.example")).toEqual({
            origin: "ftp:files.example",
            trust: "untrusted",
            sensitivity: "internal",
        });
    });

    it("lets an override win for the exact origin", () => {
        expect(labelFor("mcp:crm.acme.internal")).toEqual({
            origin: "mcp:crm.acme.internal",
            trust: "trusted",
            sensitivity: "internal",
        });
    });

    it("applies an override to paths under its origin", () => {
        expect(labelFor("file:/srv/invoices/LW-2026-0914.pdf").trust).toBe("trusted");
    });

    it("does not apply an override to an origin that only shares its prefix", () => {
        const label = labelFor("file:/srv/invoices-old/a.pdf");
        expect(label.trust).toBe("untrusted");
        expect(labelFor("mcp:crm.acme.internal.evil.example").sensitivity).toBe("public");
    });

    it("labels the user as trusted internal content", () => {
        expect(USER_LABEL).toEqual({ origin: "user", trust: "trusted", sensitivity: "internal" });
    });
});

describe("the origin overrides", () => {
    it("each change what the default mapping would say", () => {
        for (const override of ORIGIN_OVERRIDES) {
            const kind = originKind(override.origin);
            expect(DEFAULT_MAPPING[kind]).toEqual({
                trust: override.defaultTrust,
                sensitivity: override.defaultSensitivity,
            });
            expect(override.trust).not.toBe(override.defaultTrust);
        }
    });
});

describe("agentLabel", () => {
    it("names the agent as the origin", () => {
        expect(agentLabel("billing", [tool]).origin).toBe("agent:billing");
    });

    it("is untrusted and internal when the agent carries nothing known", () => {
        expect(agentLabel("billing", [])).toEqual({
            origin: "agent:billing",
            trust: "untrusted",
            sensitivity: "internal",
        });
    });

    it("stays trusted and public when everything carried is", () => {
        expect(agentLabel("support", [published])).toEqual({
            origin: "agent:support",
            trust: "trusted",
            sensitivity: "public",
        });
    });

    it("becomes untrusted from one untrusted label and internal from one internal label", () => {
        expect(agentLabel("researcher", [web, tool])).toEqual({
            origin: "agent:researcher",
            trust: "untrusted",
            sensitivity: "internal",
        });
    });
});
