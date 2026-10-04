import { describe, expect, it } from "vitest";
import { TRUSTED, UNTRUSTED, valueRecord } from "../../test/labels.ts";
import { mergeLabels } from "./merge.ts";

const hashOf = (n: number) => n.toString(16).padStart(32, "0");

const trustedValue = valueRecord({ origin: "user", trust: "trusted", sensitivity: "internal", flags: [] });

describe("mergeLabels", () => {
    it("keeps the least trusted and most sensitive label, with every origin", () => {
        expect(mergeLabels({ label: TRUSTED, values: [] }, { label: UNTRUSTED, values: [] })).toEqual({
            label: { ...UNTRUSTED, sensitivity: "internal" },
            values: [],
        });
        expect(mergeLabels({ label: UNTRUSTED, values: [] }, { label: TRUSTED, values: [] }).label).toEqual({
            ...UNTRUSTED,
            sensitivity: "internal",
        });
    });

    it("merges values by hash: the worse one keeps its origin, flags and sensitivity add up", () => {
        const web = valueRecord();
        const other = valueRecord({ hash: hashOf(1) });

        const merged = mergeLabels(
            { label: TRUSTED, values: [trustedValue] },
            { label: TRUSTED, values: [web, other] },
        );

        expect(merged.values).toEqual([{ ...web, sensitivity: "internal" }, other]);
        // The same whichever came first
        const reversed = mergeLabels({ label: TRUSTED, values: [web] }, { label: TRUSTED, values: [trustedValue] });
        expect(reversed.values).toEqual([{ ...web, sensitivity: "internal" }]);
    });

    it("ranks a flagged value above an unflagged one of the same trust", () => {
        const flagged = { ...trustedValue, origin: "tool:crm", sensitivity: "public" as const, flags: ["invisible"] };

        const merged = mergeLabels({ label: TRUSTED, values: [trustedValue] }, { label: TRUSTED, values: [flagged] });

        expect(merged.values).toEqual([{ ...flagged, sensitivity: "internal" }]);
    });

    it("caps origins at 200 and flags at 20", () => {
        const origins = (from: number) => Array.from({ length: 150 }, (_, n) => `web:site-${from + n}.com`);
        const flags = (from: number) => Array.from({ length: 15 }, (_, n) => `flag-${from + n}`);

        const merged = mergeLabels(
            { label: { ...UNTRUSTED, origins: origins(0) }, values: [valueRecord({ flags: flags(0) })] },
            { label: { ...UNTRUSTED, origins: origins(150) }, values: [valueRecord({ flags: flags(15) })] },
        );

        expect(merged.label.origins).toEqual([...origins(0), ...origins(150)].slice(0, 200));
        expect(merged.values[0]?.flags).toEqual([...flags(0), ...flags(15)].slice(0, 20));
    });

    it("keeps the 500 worst values when there are more", () => {
        const trusted = Array.from({ length: 300 }, (_, n) => ({ ...trustedValue, hash: hashOf(n) }));
        const untrusted = Array.from({ length: 300 }, (_, n) => valueRecord({ hash: hashOf(1000 + n) }));

        const merged = mergeLabels({ label: TRUSTED, values: trusted }, { label: TRUSTED, values: untrusted });

        expect(merged.values).toHaveLength(500);
        expect(merged.values.slice(0, 300)).toEqual(untrusted);
        expect(merged.values.slice(300)).toEqual(trusted.slice(0, 200));
    });
});
