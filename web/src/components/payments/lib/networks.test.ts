// @vitest-environment node
import { describe, expect, it } from "vitest";
import { networkName, txUrl } from "./networks";

const HASH = "0x" + "f".repeat(64);

describe("networkName", () => {
    it("names known v2 and v1 networks, and keeps others as recorded", () => {
        expect(networkName("eip155:8453")).toBe("Base");
        expect(networkName("base-sepolia")).toBe("Base Sepolia");
        expect(networkName("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1")).toBe("Solana devnet");
        expect(networkName("eip155:999")).toBe("eip155:999");
        expect(networkName("toString")).toBe("toString");
    });
});

describe("txUrl", () => {
    it("links a hash on a known network to its explorer", () => {
        expect(txUrl("eip155:8453", HASH)).toBe(`https://basescan.org/tx/${HASH}`);
        expect(txUrl("eip155:84532", HASH)).toBe(`https://sepolia.basescan.org/tx/${HASH}`);
        expect(txUrl("eip155:1", HASH)).toBe(`https://etherscan.io/tx/${HASH}`);
        expect(txUrl("polygon", HASH)).toBe(`https://polygonscan.com/tx/${HASH}`);
        expect(txUrl("avalanche", HASH)).toBe(`https://snowtrace.io/tx/${HASH}`);
        expect(txUrl("solana", "5abc")).toBe("https://solscan.io/tx/5abc");
        expect(txUrl("solana-devnet", "5abc")).toBe("https://solscan.io/tx/5abc?cluster=devnet");
    });

    it("gives no link for an unknown network or a hash that is not plain", () => {
        expect(txUrl("eip155:999", HASH)).toBeNull();
        expect(txUrl("base", "0xab/../evil")).toBeNull();
    });
});
