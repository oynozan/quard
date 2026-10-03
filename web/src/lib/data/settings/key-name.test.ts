// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NAME_LIMIT, nameProblem } from "./key-name";

describe("nameProblem", () => {
    it("asks for a name when it is empty or only spaces", () => {
        expect(nameProblem("   ", [])).toBe("Give the key a name, such as the app that will use it.");
    });

    it("accepts 48 characters and refuses 49", () => {
        expect(NAME_LIMIT).toBe(48);
        expect(nameProblem("a".repeat(48), [])).toBeNull();
        expect(nameProblem("a".repeat(49), [])).toBe("Keep the name under 48 characters.");
    });

    it("refuses a name an active key already uses, after trimming", () => {
        expect(nameProblem(" staging ", ["staging"])).toBe("An active key already has this name.");
    });

    it("accepts a new name", () => {
        expect(nameProblem("deploy-bot", ["staging"])).toBeNull();
    });
});
