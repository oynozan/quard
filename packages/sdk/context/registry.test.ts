import { afterEach, describe, expect, it } from "vitest";
import {
    claimCall,
    clearRegistry,
    findCall,
    findConversation,
    findResponse,
    isGuardedTool,
    registerCall,
    registerConversation,
    registerGuardedTool,
    registerResponse,
} from "./registry.ts";
import { newScope } from "./scope.ts";

afterEach(() => {
    clearRegistry();
});

describe("requested calls", () => {
    it("registers and finds a call by id", () => {
        const scope = newScope();
        const call = registerCall({ callId: "call_1", tool: "pay", args: { a: 1 }, scope, stepId: "s1" });

        expect(findCall("call_1")).toBe(call);
        expect(call).toMatchObject({ argsKey: '{"a":1}', blocked: undefined, claimed: false, outputLabel: undefined });
    });

    it("lets guard() claim the oldest open call with equal arguments once", () => {
        const scope = newScope();
        registerCall({ callId: "call_1", tool: "pay", args: { b: 2, a: 1 }, scope, stepId: "s1" });
        registerCall({ callId: "call_2", tool: "pay", args: { a: 1, b: 2 }, scope, stepId: "s1" });

        expect(claimCall("pay", { a: 1, b: 2 })?.callId).toBe("call_1");
        expect(claimCall("pay", { a: 1, b: 2 })?.callId).toBe("call_2");
        expect(claimCall("pay", { a: 1, b: 2 })).toBeUndefined();
        expect(claimCall("other", { a: 1, b: 2 })).toBeUndefined();
    });

    it("keeps a blocked mark", () => {
        const call = registerCall({
            callId: "call_9",
            tool: "pay",
            args: {},
            scope: newScope(),
            stepId: "s",
            blocked: { guard: "permission", reason: "permission_denied" },
        });

        expect(call.blocked).toEqual({ guard: "permission", reason: "permission_denied" });
    });

    it("forgets the oldest entries past the limit", () => {
        const scope = newScope();
        for (let i = 0; i <= 10_000; i++) {
            registerCall({ callId: `call_${i}`, tool: "t", args: i, scope, stepId: "s" });
        }

        expect(findCall("call_0")).toBeUndefined();
        expect(findCall("call_10000")).toBeDefined();
    });
});

describe("responses and guarded tools", () => {
    it("maps a response id to its scope", () => {
        const scope = newScope();
        registerResponse("resp_1", scope);

        expect(findResponse("resp_1")).toBe(scope);
        expect(findResponse("resp_2")).toBeUndefined();
    });

    it("tracks which tools are guarded", () => {
        registerGuardedTool("fetchPage");

        expect(isGuardedTool("fetchPage")).toBe(true);
        expect(isGuardedTool("rm")).toBe(false);
    });
});

describe("claiming inside and outside a run", () => {
    it("only claims calls from the run it is given", () => {
        const a = newScope();
        const b = newScope();
        registerCall({ callId: "call_a", tool: "pay", args: { x: 1 }, scope: a, stepId: "s" });

        expect(claimCall("pay", { x: 1 }, b.run)).toBeUndefined();
        expect(claimCall("pay", { x: 1 }, a.run)?.callId).toBe("call_a");
    });

    it("prefers a blocked twin over an allowed one", () => {
        const blocked = { guard: "permission", reason: "permission_denied" as const };
        registerCall({ callId: "call_ok", tool: "pay", args: { x: 1 }, scope: newScope(), stepId: "s" });
        registerCall({ callId: "call_no", tool: "pay", args: { x: 1 }, scope: newScope(), stepId: "s", blocked });

        expect(claimCall("pay", { x: 1 })?.callId).toBe("call_no");
    });

    it("outside a run, still finds a blocked call whose arguments changed", () => {
        const blocked = { guard: "permission", reason: "permission_denied" as const };
        const scope = newScope();
        registerCall({ callId: "call_b", tool: "pay", args: { x: 1 }, scope, stepId: "s", blocked });

        expect(claimCall("pay", { x: 1, memo: "extra" }, scope.run)).toBeUndefined();
        expect(claimCall("pay", { x: 1, memo: "extra" })?.callId).toBe("call_b");
        expect(claimCall("other", { x: 1 })).toBeUndefined();
    });

    it("keeps the value keys of the arguments", () => {
        const call = registerCall({
            callId: "call_k",
            tool: "t",
            args: { iban: "DE89370400440532013000" },
            scope: newScope(),
            stepId: "s",
        });

        expect([...call.argKeys]).toEqual(["iban:DE89370400440532013000"]);
    });
});

describe("conversations", () => {
    it("maps a conversation id to its scope", () => {
        const scope = newScope();
        registerConversation("conv_1", scope);

        expect(findConversation("conv_1")).toBe(scope);
        expect(findConversation("conv_2")).toBeUndefined();
    });
});
