import type { FleetValue } from "@quard/shared";
import type { FleetUseInput } from "../queries/control/fleet/record.ts";

export const IBAN: FleetValue = { field: "iban", kind: "iban", key: `iban:GB33…5555#${"e".repeat(32)}` };
export const EMAIL: FleetValue = { field: "to", kind: "email", key: `email:j…@evil.com#${"f".repeat(32)}` };
export const DOMAIN: FleetValue = { field: "url", kind: "domain", key: "domain:evil.com" };
// An x402 payee, public on chain, so kept in clear
export const WALLET: FleetValue = {
    field: "payTo",
    kind: "wallet",
    key: "wallet:0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
};

export const T0 = new Date("2026-10-03T12:00:00.000Z");

export function after(hours: number): Date {
    return new Date(T0.getTime() + hours * 3_600_000);
}

export function runId(n: number): string {
    return n.toString(16).padStart(32, "0");
}

// A payInvoice call in run `n` that used these values
export function use(n: number, values: FleetValue[], fields: Partial<FleetUseInput> = {}): FleetUseInput {
    return { runId: runId(n), agent: "billing", tool: "payInvoice", blocked: false, values, ...fields };
}
