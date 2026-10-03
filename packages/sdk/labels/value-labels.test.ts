import { labelFor } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { ContentIndex } from "./content-index.ts";
import { exactOccurrences, firstAppearance, labelArguments, valuesAt } from "./value-labels.ts";

const IBAN = "DE89370400440532013000";

describe("labelArguments", () => {
    it("traces values to where they appeared", () => {
        const index = new ContentIndex();
        index.add(`Supplier IBAN: DE89 3704 0044 0532 0130 00`, labelFor("web:evil.com"), "s1");

        const labels = labelArguments({ iban: IBAN, amount: 4950, note: "Thanks" }, index);

        expect(labels).toHaveLength(3);
        expect(labels[0]).toMatchObject({
            path: "iban",
            values: [{ type: "iban", value: IBAN, modelGenerated: false }],
        });
        expect(labels[0]?.values[0]?.occurrences[0]?.origin).toBe("web:evil.com");
        expect(labels[1]).toEqual({ path: "amount", values: [] });
        expect(labels[2]).toEqual({ path: "note", values: [] });
    });

    it("marks values found nowhere as model-generated", () => {
        const labels = labelArguments({ iban: IBAN }, new ContentIndex());

        expect(labels[0]?.values[0]).toMatchObject({ occurrences: [], modelGenerated: true });
    });

    it("finds known values inside longer text", () => {
        const index = new ContentIndex();
        index.add("portal https://evil.com/inv", labelFor("web:evil.com"), "s1");

        const labels = labelArguments({ body: "Please pay via https://evil.com/inv today" }, index);

        expect(labels[0]?.values.map((value) => value.type)).toEqual(["url"]);
        expect(labels[0]?.values.every((value) => !value.modelGenerated)).toBe(true);
    });
});

describe("valuesAt", () => {
    it("collects a field and its nested parts only", () => {
        const labels = labelArguments(
            { to: ["a@x.com", "b@y.com"], toll: "c@z.com", invoice: { iban: IBAN } },
            new ContentIndex(),
        );

        expect(valuesAt(labels, "to").map((value) => value.value)).toEqual(["a@x.com", "b@y.com"]);
        expect(valuesAt(labels, "invoice").map((value) => value.value)).toEqual([IBAN]);
        expect(valuesAt(labels, "invoice.iban")).toHaveLength(1);
        expect(valuesAt(labels, "missing")).toEqual([]);
    });
});

describe("exactOccurrences and firstAppearance", () => {
    it("keeps only exact matches, or host matches for a bare host", () => {
        const index = new ContentIndex();
        index.add("our domain is acme.com", labelFor("user"), "s1");
        index.add("write to alice@acme.com", labelFor("tool:crm"), "s2");

        const [email] = labelArguments({ to: "mallory@acme.com" }, index)[0]?.values ?? [];
        const [host] = labelArguments({ host: "acme.com" }, index)[0]?.values ?? [];

        expect(email && exactOccurrences(email)).toEqual([]);
        // The CRM email's host is acme.com, so it counts for the bare host too
        expect(host && exactOccurrences(host).map((o) => o.origin)).toEqual(["user", "tool:crm"]);
    });

    it("uses the strongest kind of match, oldest first", () => {
        const index = new ContentIndex();
        index.add("see portal.evil.com", labelFor("web:evil.com"), "s1");
        index.add("mail admin@evil.com", labelFor("user"), "s2");
        const webOnly = new ContentIndex();
        webOnly.add("see portal.evil.com", labelFor("web:evil.com"), "s1");

        const [value] = labelArguments({ to: "admin@evil.com" }, index)[0]?.values ?? [];
        const [other] = labelArguments({ to: "root@evil.com" }, webOnly)[0]?.values ?? [];

        expect(value && firstAppearance(value, ["exact", "host", "domain"])?.origin).toBe("user");
        expect(other && firstAppearance(other, ["exact", "host", "domain"])?.match).toBe("domain");
        expect(other && firstAppearance(other, ["exact", "host"])).toBeUndefined();
    });
});
