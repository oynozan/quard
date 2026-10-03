// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as settings from "./settings";
import { getSettings, rulesFromCode } from "./settings/query";

describe("settings module", () => {
    it("passes on the settings query functions unchanged", () => {
        expect(settings.getSettings).toBe(getSettings);
        expect(settings.rulesFromCode).toBe(rulesFromCode);
    });
});
