import { ibanFrom } from "@quard/shared";

// A hashed value: "iban:DE89…3000#<hash>" or "email:j…@acme.com#<hash>"
const HASHED = /^(iban|email):(.+)#([0-9a-f]{32})$/;

// A value in a valid format, built from a hashed value's hash, that takes
// the place of its mask in a replayed request
export type StandIn = {
    mask: string;
    value: string;
    // Every stored key with this mask, and the key the stand-in gets when found in a rerun
    keys: string[];
    asKey: string;
};

function standInOf(key: string): StandIn[] {
    const match = HASHED.exec(key);
    if (match === null) {
        return [];
    }
    const [, kind, mask, hash] = match as unknown as [string, "iban" | "email", string, string];
    // An IBAN gets a valid checksum, and an email keeps its domain
    const value =
        kind === "iban" ? ibanFrom(mask.slice(0, 2), hash) : `${hash.slice(0, 12)}${mask.slice(mask.indexOf("@"))}`;
    return value === undefined ? [] : [{ mask, value, keys: [key], asKey: `${kind}:${value}` }];
}

// One stand-in per mask among a run's value keys. Two values with the same
// mask share one, so it maps back to the stored keys of both.
export function standInsOf(keys: string[]): StandIn[] {
    const all = [...new Set(keys)].flatMap(standInOf);
    const last = new Map(all.map((item) => [item.mask, item]));
    return [...last.values()].map((item) => ({
        ...item,
        keys: all.filter((other) => other.mask === item.mask).flatMap((other) => other.keys),
    }));
}

// The body with each mask replaced by its stand-in, longest mask first
export function withStandIns(body: Record<string, unknown>, standIns: StandIn[]): Record<string, unknown> {
    const text = standIns
        .toSorted((a, b) => b.mask.length - a.mask.length)
        .reduce((json, item) => json.replaceAll(item.mask, item.value), JSON.stringify(body));
    return JSON.parse(text) as Record<string, unknown>;
}
