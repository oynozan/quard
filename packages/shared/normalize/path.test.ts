import { describe, expect, it } from "vitest";
import { findPaths, normalizePath } from "./path.ts";

describe("normalizePath", () => {
    it.each([
        ["/etc//nginx/./conf/../passwd", "/etc/nginx/passwd"],
        ["C:\\Users\\bob\\file.txt", "c:/Users/bob/file.txt"],
        ["~/secrets/../keys", "~/keys"],
        ["../../a/./b", "../../a/b"],
        ["./a/../../b", "../b"],
        ["/../x", "/x"],
    ])("normalizes %s", (value, expected) => {
        expect(normalizePath(value)).toBe(expected);
    });
});

describe("findPaths", () => {
    it("finds paths after spaces, quotes and equals signs", () => {
        expect(findPaths('rm /etc/passwd and path="C:\\temp\\x.bin" or ~/a/b ./c')).toEqual([
            "/etc/passwd",
            "c:/temp/x.bin",
            "~/a/b",
            "c",
        ]);
    });

    it("skips a bare root and empty paths", () => {
        expect(findPaths("cd /. and ./. or ../..")).toEqual(["../.."]);
    });

    it("does not read web addresses as paths", () => {
        expect(findPaths("https://evil.com/inv")).toEqual([]);
    });
});
