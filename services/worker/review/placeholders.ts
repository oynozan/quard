import { CUT } from "@quard/shared";

// A masked IBAN or email, alone or as a value key: "DE89…3000",
// "iban:DE89…3000#<hash>", "j…@acme.com" or "email:j…@acme.com#<hash>"
const MASKED = new RegExp(
    `(?:(?:iban|email):)?(?:([A-Z]{2}\\d{2}${CUT}[A-Z0-9]{4})|([^\\s"@:${CUT}]${CUT}@[a-z0-9.-]+))(?:#[0-9a-f]{32})?`,
    "gi",
);

// Masked IBANs and emails become "[IBAN 1]" and "[email 1]", so the
// reviewer sees no part of them. The same mask keeps the same placeholder.
export function withPlaceholders(text: string): string {
    const names = new Map<string, string>();
    const counts = { IBAN: 0, email: 0 };
    return text.replace(MASKED, (_match, iban: string | undefined, email: string | undefined) => {
        const kind = iban === undefined ? "email" : "IBAN";
        const mask = `${kind}:${iban ?? email}`;
        const name = names.get(mask) ?? `[${kind} ${(counts[kind] += 1)}]`;
        names.set(mask, name);
        return name;
    });
}
