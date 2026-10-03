import { describe, expect, it } from "vitest";
import { z } from "zod";
import { feedSchema } from "../signatures/schema.ts";
import { policySchema } from "./schema.ts";

// Editors check policy and feed files against these files as people
// type. `pnpm --filter quard schemas` rewrites them after a change.
function schemaFile(schema: z.ZodType): string {
    return `${JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), null, 4)}\n`;
}

describe("JSON Schema files", () => {
    it("match the policy file schema", async () => {
        await expect(schemaFile(policySchema)).toMatchFileSnapshot("../examples/policy/quard.policy.schema.json");
    });

    it("match the signature feed schema", async () => {
        await expect(schemaFile(feedSchema)).toMatchFileSnapshot("../examples/signatures/signatures.schema.json");
    });
});
