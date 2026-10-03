// @vitest-environment node
import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
    it("keeps paths on this site, with their query and hash", () => {
        expect(safeNext("/runs?agent=billing")).toBe("/runs?agent=billing");
        expect(safeNext("/incidents/inc_118#path")).toBe("/incidents/inc_118#path");
        expect(safeNext("/sign-in/../runs")).toBe("/runs");
    });

    it("falls back to the overview for anything that leaves the site", () => {
        for (const bad of [null, undefined, "", "runs", "https://evil.com", "//evil.com", "/\\evil.com", "/a\nb"]) {
            expect(safeNext(bad)).toBe("/");
        }
    });

    it("never yields a protocol-relative path, even through dot segments", () => {
        for (const sneaky of ["/.//evil.com", "/x/..//evil.com", "/%2e//evil.com", "/./%2e//evil.com"]) {
            const result = safeNext(sneaky);
            expect(result.startsWith("//")).toBe(false);
            expect(new URL(result, "https://quard.example").host).toBe("quard.example");
        }
    });

    it("never returns to the sign-in page or an API route", () => {
        for (const loop of [
            "/sign-in",
            "/sign-in?next=/runs",
            "/sign-in/x",
            "/./sign-in",
            "/api/auth/session",
            "/./api/x",
        ]) {
            expect(safeNext(loop)).toBe("/");
        }
    });

    it("keeps odd but harmless paths, encoded", () => {
        expect(safeNext("/%%")).toBe("/%%");
        expect(safeNext("/a b")).toBe("/a%20b");
    });
});
