import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseN, tempDir, writeJson } from "../test/files.ts";
import { fileSource } from "./file-source.ts";

afterEach(() => {
    vi.useRealTimers();
});

describe("fileSource", () => {
    it("rereads at most once a second and swaps in a valid change", () => {
        vi.useFakeTimers({ toFake: ["Date"], now: 0 });
        const path = writeJson(join(tempDir(), "f.json"), { n: 1 });
        const source = fileSource(path, parseN, () => undefined);
        writeJson(path, { n: 2 });

        source.refresh(500);
        expect(source.current()).toBe(1);
        source.refresh(1000);
        expect(source.current()).toBe(2);
    });

    it("keeps the last good value and reports a broken change once", () => {
        const errors: string[] = [];
        const path = writeJson(join(tempDir(), "f.json"), { n: 1 });
        const source = fileSource(path, parseN, (message) => errors.push(message), 0);
        writeJson(path, { n: "x" });

        source.refresh(Date.now() + 1);
        source.refresh(Date.now() + 2);

        expect(source.current()).toBe(1);
        expect(errors).toEqual([`${path}: n must be a number`]);
    });

    it("throws at once when the first version is broken", () => {
        const path = writeJson(join(tempDir(), "f.json"), "{ broken");

        expect(() => fileSource(path, parseN, () => undefined)).toThrow(SyntaxError);
    });

    it("has nothing to close", () => {
        const source = fileSource(writeJson(join(tempDir(), "f.json"), { n: 1 }), parseN, () => undefined);

        expect(source.close()).toBeUndefined();
    });
});
