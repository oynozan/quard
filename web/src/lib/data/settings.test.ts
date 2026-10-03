// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as settings from "./settings";
import { getSettings } from "./settings/query";

describe("settings module", () => {
    it("passes on only the settings query", () => {
        expect(settings.getSettings).toBe(getSettings);
        expect(Object.keys(settings)).toEqual(["getSettings"]);
    });
});
