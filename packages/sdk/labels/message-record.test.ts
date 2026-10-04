import { messageRecord } from "@quard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { forgetProjectKey, learnProjectKey } from "../core/project-key.ts";
import { PROJECT_KEY_TEXT } from "../test/hash-key.ts";
import { messageRecordOf, type SentMessage } from "./message-record.ts";

const RUN_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

function sent(fields: Partial<SentMessage> = {}): SentMessage {
    return {
        ref: "a".repeat(16),
        runId: RUN_ID,
        stepId: "1".repeat(16),
        sender: "orchestrator",
        depth: 1,
        print: "c".repeat(64),
        label: { trust: "untrusted", sensitivity: "public", origins: ["web:evil.com"], flagged: true },
        values: [],
        tools: undefined,
        ...fields,
    };
}

afterEach(forgetProjectKey);

describe("messageRecordOf", () => {
    it("keeps what the receiver needs, and no step or tools when there are none", () => {
        expect(messageRecordOf(sent())).toEqual({
            kind: "message",
            ref: "a".repeat(16),
            runId: RUN_ID,
            stepId: "1".repeat(16),
            sender: "orchestrator",
            depth: 1,
            print: "c".repeat(64),
            label: { trust: "untrusted", sensitivity: "public", origins: ["web:evil.com"], flagged: true },
            values: [],
        });
        expect(messageRecordOf(sent({ stepId: undefined, tools: ["send", "pay"] }))).not.toHaveProperty("stepId");
        expect(messageRecordOf(sent({ tools: ["send", "pay"] })).tools).toEqual(["send", "pay"]);
    });

    it("cuts what is too long to fit, so webhook stores it", () => {
        learnProjectKey(PROJECT_KEY_TEXT);
        const value = {
            type: "id" as const,
            value: "",
            key: "",
            origin: `web:${"o".repeat(3000)}`,
            trust: "untrusted" as const,
            sensitivity: "public" as const,
            flags: Array.from({ length: 30 }, () => "f".repeat(150)),
            stepId: "1".repeat(16),
        };
        const record = messageRecordOf(
            sent({
                sender: "s".repeat(300),
                depth: 5000,
                label: {
                    trust: "untrusted",
                    sensitivity: "public",
                    origins: Array.from({ length: 300 }, (_, n) => `web:${n}${"x".repeat(3000)}`),
                    flagged: false,
                },
                values: Array.from({ length: 600 }, (_, n) => ({ ...value, value: `INV-${n}-2026`, key: `id:${n}` })),
                tools: ["", "t".repeat(201), ...Array.from({ length: 600 }, (_, n) => `tool${n}`)],
            }),
        );

        expect(messageRecord.safeParse(record).success).toBe(true);
        expect(record.sender).toHaveLength(200);
        expect(record.depth).toBe(1000);
        expect(record.label.origins).toHaveLength(200);
        expect(record.values).toHaveLength(500);
        expect(record.values[0]?.flags).toHaveLength(20);
        expect(record.tools).toHaveLength(500);
        expect(record.tools?.[0]).toBe("tool0");
    });

    it("names an agent with no name", () => {
        expect(messageRecordOf(sent({ sender: "" })).sender).toBe("-");
    });
});
