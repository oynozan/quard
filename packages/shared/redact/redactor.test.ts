import { describe, expect, it } from "vitest";
import { keyedHash, parseHashKey } from "./hash.ts";
import { createRedactor, redactText } from "./redactor.ts";

const KEY = parseHashKey("ab".repeat(32));
const redactor = createRedactor(KEY);
const IBAN = "DE89370400440532013000";

type HtmlNode = { id: string; parent?: HtmlNode; prev?: HtmlNode; next?: HtmlNode; children: HtmlNode[] };

// Nodes that know their parent and their siblings, as parsed HTML does
function addChildren(parent: HtmlNode, count: number): HtmlNode[] {
    for (let at = 0; at < count; at++) {
        const prev = parent.children.at(-1);
        const node: HtmlNode = { id: `${parent.id}.${at}`, parent, prev, children: [] };
        if (prev !== undefined) {
            prev.next = node;
        }
        parent.children.push(node);
    }
    return parent.children;
}

function linkedTable(rows: number, cells: number): HtmlNode {
    const table: HtmlNode = { id: "table", children: [] };
    for (const row of addChildren(table, rows)) {
        addChildren(row, cells);
    }
    return table;
}

describe("redactText", () => {
    it("masks IBANs, card numbers and emails, and removes secrets", () => {
        const text = `Pay DE89 3704 0044 0532 0130 00 with 4111 1111 1111 1111, mail Jane@Acme.com, key sk-${"x".repeat(30)}`;
        expect(redactText(text)).toBe("Pay DE89…3000 with 4111…1111, mail j…@acme.com, key sk-…");
    });

    it("masks values split by no-break spaces or hidden characters", () => {
        const nbsp = "DE89 3704 0044 0532 0130 00";
        const card = "4111​1111​1111​1111";
        const email = "ja‍ne@acme.com";
        expect(redactText(`${nbsp} ${card} ${email}`)).toBe("DE89…3000 4111…1111 j…@acme.com");
    });

    it("removes the user and password of a URL, not just part of them as an email", () => {
        expect(redactText("cache at redis://user:hunter2@cache.acme.com:6379")).toBe(
            "cache at redis://…@cache.acme.com:6379",
        );
    });

    it.each([
        ["smtp://jane@acme.com:hunter2@smtp.acme.com:587", "smtp://…@smtp.acme.com:587"],
        ["imaps://me.x@gmail.com:hunter2@imap.gmail.com", "imaps://…@imap.gmail.com"],
    ])("removes the whole user and password of %s, with no part left in clear", (text, expected) => {
        expect(redactText(text)).toBe(expected);
    });

    it("stops a URL's user and password at a quote, so the next email is only masked", () => {
        expect(redactText("['DSN redis://u:pw@cache.acme.com','jane@acme.com']")).toBe(
            "['DSN redis://…@cache.acme.com','j…@acme.com']",
        );
    });

    it("changes nothing the second time", () => {
        const once = redactText(`IBAN ${IBAN}, jane@acme.com, 5555555555554444, redis://u:hunter2@cache.acme.com`);
        expect(redactText(once)).toBe(once);
    });

    it.each([
        ["client_secret=DE89 3704 0044 0532 0130 00", "client_secret=…"],
        ['id_token":4111 1111 1111 1111', 'id_token":…'],
    ])(
        "removes a spaced IBAN or card under a secret name at once, so a second run changes nothing: %s",
        (text, expected) => {
            expect(redactText(text)).toBe(expected);
            expect(redactText(expected)).toBe(expected);
        },
    );
});

describe("redactor.key", () => {
    it("hashes and masks sensitive keys", () => {
        expect(redactor.key(`iban:${IBAN}`)).toBe(`iban:DE89…3000#${keyedHash(KEY, "iban", IBAN)}`);
        expect(redactor.key("email:jane@acme.com")).toBe(
            `email:j…@acme.com#${keyedHash(KEY, "email", "jane@acme.com")}`,
        );
    });

    it("keeps other keys readable, minus secrets", () => {
        expect(redactor.key("host:acme.com")).toBe("host:acme.com");
        expect(redactor.key("url:https://x.io/?token=abcdef123")).toBe("url:https://x.io/?token=…");
        expect(redactor.key(`plain ${IBAN}`)).toBe("plain DE89…3000");
    });

    it("keeps a hash that is already there, but never a raw value", () => {
        const hashed = redactor.key(`iban:${IBAN}`);
        expect(redactor.key(hashed)).toBe(hashed);
        const forged = `iban:${IBAN}#${"0".repeat(32)}`;
        expect(redactor.key(forged)).toBe(`iban:DE89…3000#${"0".repeat(32)}`);
    });
});

describe("redactor.value", () => {
    it("redacts every string deeply, keys included", () => {
        const input = { to: "jane@acme.com", list: [IBAN, 5, null, true], nested: { "a@b.co": "x" } };
        expect(redactor.value(input)).toEqual({
            to: "j…@acme.com",
            list: ["DE89…3000", 5, null, true],
            nested: { "a…@b.co": "x" },
        });
    });

    it("masks a card number sent as a number, as the same digits in text", () => {
        const masked = redactor.value({ card: 4111111111111111, amex: 378282246310005, list: [5555555555554444] });

        expect(masked).toEqual({ card: "4111…1111", amex: "3782…0005", list: ["5555…4444"] });
        expect(masked).toEqual(
            redactor.value({ card: "4111111111111111", amex: "378282246310005", list: ["5555555555554444"] }),
        );
    });

    it("keeps other numbers as numbers", () => {
        const numbers = [
            4950, 4111111111111112, 1000000000000008, 1696334400000, -4111111111111111, 4111111111111111.5,
        ];

        expect(redactor.value(numbers)).toEqual(numbers);
    });

    it("checks a number past 2^53 by the digits JSON stores for it", () => {
        // A 17-digit card number that a number holds exactly
        expect(redactor.value(52222222222222344)).toBe("5222…2344");
        // A 19-digit one loses its last digits, so what is left is no card number
        const rounded: unknown = JSON.parse("4000000000000000006");
        expect(redactor.value(rounded)).toBe(rounded);
    });

    it("turns a BigInt into its digits, masking a card number as the same digits in text", () => {
        const masked = redactor.value({ amount: 10n, card: 4111111111111111n, list: [5555555555554444n] });

        expect(masked).toEqual({ amount: "10", card: "4111…1111", list: ["5555…4444"] });
        expect(masked).toEqual(redactor.value({ amount: "10", card: "4111111111111111", list: ["5555555555554444"] }));
    });

    it("cuts a value where it sits inside itself, however often it does", () => {
        const node: Record<string, unknown> = { iban: IBAN };
        node.left = node;
        node.right = node;
        const list: unknown[] = ["x"];
        list.push(list);

        expect(redactor.value({ node, list })).toEqual({
            node: { iban: "DE89…3000", left: "…", right: "…" },
            list: ["x", "…"],
        });
    });

    it("keeps in full a value used twice without being inside itself", () => {
        const payee = { iban: IBAN };

        expect(redactor.value({ from: payee, to: [payee] })).toEqual({
            from: { iban: "DE89…3000" },
            to: [{ iban: "DE89…3000" }],
        });
    });

    it("copies each node of a table linked like parsed HTML once, and fast", () => {
        const table = linkedTable(30, 30);
        const start = performance.now();

        const json = JSON.stringify(redactor.value(table));

        expect(performance.now() - start).toBeLessThan(1_000);
        const ids = json.match(/"id":"[^"]*"/g) ?? [];
        expect(new Set(ids).size).toBe(ids.length);
        // Most of the 931 nodes are kept, each once
        expect(ids.length).toBeGreaterThan(800);
    });

    it("copies each of ten objects that all point at each other once, and fast", () => {
        const objects = Array.from({ length: 10 }, (_, id): Record<string, unknown> => ({ id }));
        for (const object of objects) {
            objects.forEach((other, at) => (object[`to${at}`] = other));
        }
        const start = performance.now();

        const json = JSON.stringify(redactor.value(objects[0]));

        expect(performance.now() - start).toBeLessThan(1_000);
        expect(json.match(/"id":\d/g)).toHaveLength(10);
    });

    it("redacts what a value's toJSON gives, as JSON would send it", () => {
        const payee = { name: "Jo", toJSON: () => ({ name: "Jo", card: "4111111111111111" }) };
        const at = new Date("2026-10-04T12:00:00.000Z");

        const masked = redactor.value({ payee, amount: { toJSON: () => 10n }, at });

        expect(masked).toEqual({
            payee: { name: "Jo", card: "4111…1111" },
            amount: "10",
            at: "2026-10-04T12:00:00.000Z",
        });
        expect(JSON.stringify(masked)).not.toContain("4111111111111111");
    });

    it("leaves functions out as JSON does, so none runs when the copy is sent", () => {
        const card = () => "4111111111111111";
        const value = { pay: card, list: [card], inner: { toJSON: () => ({ toJSON: card }) } };

        expect(JSON.stringify(redactor.value(value))).toBe('{"list":[null],"inner":{}}');
    });

    it("cuts a value where what its toJSON gives holds it again", () => {
        const self = {
            id: 1,
            toJSON(): unknown {
                return this;
            },
        };
        const wrapped = {
            id: 2,
            toJSON(): unknown {
                return { wrapped: this };
            },
        };

        expect(JSON.stringify(redactor.value([self, wrapped]))).toBe('[{"id":1},{"wrapped":"…"}]');
    });

    it("removes whatever a secret-named field holds", () => {
        expect(redactor.value({ password: "hunter2", token: { value: "x" }, name: "Jo" })).toEqual({
            password: "…",
            token: "…",
            name: "Jo",
        });
    });

    it("keeps nothing past the depth limit", () => {
        let deep: unknown = IBAN;
        for (let i = 0; i < 40; i++) {
            deep = [deep];
        }
        expect(JSON.stringify(redactor.value(deep))).not.toContain(IBAN);
    });
});
