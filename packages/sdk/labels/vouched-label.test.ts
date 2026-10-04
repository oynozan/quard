import { labelFor } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../core/config.ts";
import { resetAll } from "../test/reset.ts";
import { ContentIndex } from "./content-index.ts";
import { vouchedLabel } from "./vouched-label.ts";

afterEach(() => {
    resetAll();
});

describe("vouchedLabel", () => {
    it("is the run's context label once the run read something", () => {
        const index = new ContentIndex();
        index.add("Order 114", labelFor("tool:crm"), "s1");

        expect(vouchedLabel(index)).toEqual(index.context());
    });

    it("is unknown content when the run read nothing, with the team's override", () => {
        expect(vouchedLabel(new ContentIndex())).toEqual({
            trust: "untrusted",
            sensitivity: "internal",
            origins: ["unknown"],
            flagged: false,
        });

        configure({ origins: { unknown: { trust: "untrusted", sensitivity: "public" } } });

        expect(vouchedLabel(new ContentIndex())).toMatchObject({ sensitivity: "public" });
    });
});
