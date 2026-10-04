import { describe, expect, it } from "vitest";
import { allowedDomains } from "./domains.ts";

describe("allowedDomains", () => {
    it("leaves the search alone with no allowlist", () => {
        expect(allowedDomains(["acme.com"], [])).toBeUndefined();
    });

    it("turns allow patterns into API domains", () => {
        expect(allowedDomains(undefined, [["*.Acme.com", "acme.com", "news.org"]])).toEqual(["acme.com", "news.org"]);
    });

    it("keeps the narrower domain of each pair both lists allow", () => {
        expect(allowedDomains(["docs.acme.com", "other.com", 5], [["acme.com"]])).toEqual(["docs.acme.com"]);
        expect(allowedDomains(["ACME.com"], [["docs.acme.com"]])).toEqual(["docs.acme.com"]);
    });

    it("uses Quard's list when the app's list allows none of it", () => {
        expect(allowedDomains(["other.com"], [["acme.com"]])).toEqual(["acme.com"]);
    });

    it("narrows by every allowlist in turn", () => {
        expect(allowedDomains(undefined, [["acme.com", "news.org"], ["docs.acme.com"]])).toEqual(["docs.acme.com"]);
    });
});
