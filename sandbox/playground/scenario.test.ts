import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { defaults, emptyFolder, removeFolders } from "../test/folder.ts";
import { parseScenario, readScenario } from "./scenario.ts";

afterAll(removeFolders);

const valid = defaults("scenario");

function problem(value: unknown): string {
    try {
        parseScenario(JSON.stringify(value));
    } catch (error) {
        return (error as Error).message;
    }
    return "valid";
}

describe("parseScenario", () => {
    it("reads a valid scenario", () => {
        expect(parseScenario(JSON.stringify(valid))).toEqual(valid);
    });

    it("says in plain words what is wrong", () => {
        expect(problem({ ...valid, model: "", prompt: "" })).toBe(
            "scenario.json is not valid: model must not be empty; prompt must not be empty",
        );
        expect(problem({ ...valid, tools: [] })).toBe("scenario.json is not valid: tools must name at least one tool");
        expect(problem({ ...valid, tools: ["deleteAll"] })).toContain("tools may only name readEmail, fetchPage");
        expect(problem({ ...valid, tools: "readEmail" })).toContain("tools must be a list of tool names");
        expect(problem({ ...valid, detector: "yes" })).toContain("detector must be true or false");
        expect(problem({ ...valid, email: undefined })).toContain("email must be text");
        expect(problem([])).toBe("scenario.json is not valid: the scenario must be a JSON object");
    });

    it("says when the text is not JSON", () => {
        expect(() => parseScenario("{")).toThrow(/^scenario.json is not valid JSON: /);
    });
});

describe("readScenario", () => {
    it("reads the file", () => {
        const file = join(emptyFolder(), "scenario.json");
        writeFileSync(file, JSON.stringify(valid));
        expect(readScenario(file)).toEqual(valid);
    });
});
