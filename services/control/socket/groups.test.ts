import { describe, expect, it } from "vitest";
import { createGroups } from "./groups.ts";

describe("createGroups", () => {
    it("groups items by key and drops a key with its last item", () => {
        const groups = createGroups<number>();

        groups.add("a", 1);
        groups.add("a", 2);
        groups.add("b", 3);
        expect(groups.get("a")).toEqual([1, 2]);
        expect(groups.keys()).toEqual(["a", "b"]);

        groups.delete("a", 1);
        expect(groups.get("a")).toEqual([2]);
        groups.delete("a", 2);
        expect(groups.keys()).toEqual(["b"]);
        expect(groups.get("a")).toEqual([]);
    });

    it("ignores an item or a key it does not have", () => {
        const groups = createGroups<number>();
        groups.add("a", 1);

        groups.delete("a", 9);
        groups.delete("nope", 1);

        expect(groups.get("a")).toEqual([1]);
        expect(groups.keys()).toEqual(["a"]);
    });
});
