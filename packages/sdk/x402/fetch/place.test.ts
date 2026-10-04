import { describe, expect, it } from "vitest";
import { headersOf, placeOf, urlOf } from "./place.ts";

describe("place", () => {
    it("reads the URL and headers of a fetch call", () => {
        const request = new Request("https://api.example/a", { headers: { "x-payment": "1" } });
        expect(urlOf(request)).toBe("https://api.example/a");
        expect(urlOf(new URL("https://api.example/b"))).toBe("https://api.example/b");
        expect(headersOf(request).get("x-payment")).toBe("1");
        expect(headersOf(request, { headers: { other: "2" } }).get("x-payment")).toBeNull();
        expect(headersOf("https://api.example/c").get("x-payment")).toBeNull();
    });

    it("gives a relative URL no host", () => {
        expect(placeOf("/paid")).toEqual({ key: "/paid", host: "", resource: "/paid" });
        expect(placeOf("https://API.example:8443/x").host).toBe("api.example");
    });
});
