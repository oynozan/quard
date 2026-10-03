import { describe, expect, it } from "vitest";
import * as shared from "./index.ts";

describe("@quard/shared", () => {
    it("exports its public functions and schemas", () => {
        expect(Object.keys(shared).sort()).toEqual([
            "INVISIBLE",
            "cleanText",
            "combineLabels",
            "contentEvent",
            "decisionEvent",
            "emailHost",
            "extractValues",
            "findEmails",
            "findHosts",
            "findIbans",
            "findIds",
            "findPaths",
            "findUrls",
            "flattenArgs",
            "hasInvisible",
            "hostMatches",
            "isIdentifierLike",
            "isRunId",
            "isStepId",
            "isValidIban",
            "labelFor",
            "mainDomain",
            "modelCallEvent",
            "newRunId",
            "newStepId",
            "normalizeEmail",
            "normalizeHost",
            "normalizeIban",
            "normalizePath",
            "normalizeUrl",
            "originKind",
            "readPort",
            "refusalText",
            "runEvent",
            "runStartedEvent",
            "toolCallEvent",
            "urlHost",
            "valueAtPath",
            "warningEvent",
        ]);
    });
});
