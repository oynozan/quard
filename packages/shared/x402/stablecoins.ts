// USD stablecoins by contract or mint address, on any chain. A token not
// listed has no known USD value.
const STABLECOINS: Record<string, { symbol: string; decimals: number }> = {
    // USDC: Base, Base Sepolia, Ethereum, Polygon, Avalanche
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
    "0x036cbd53842c5426634e7929541ec2318f3dcf7e": { symbol: "USDC", decimals: 6 },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6 },
    "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": { symbol: "USDC", decimals: 6 },
    // USDC on Solana and Solana devnet; mint addresses are case-sensitive
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": { symbol: "USDC", decimals: 6 },
};

function find(asset: string): { symbol: string; decimals: number } | undefined {
    return Object.hasOwn(STABLECOINS, asset)
        ? STABLECOINS[asset]
        : Object.hasOwn(STABLECOINS, asset.toLowerCase())
          ? STABLECOINS[asset.toLowerCase()]
          : undefined;
}

// The USD value of an amount in atomic units, or null when the token's value is unknown
export function usdValue(asset: string, amount: string): number | null {
    const coin = find(asset);
    if (coin === undefined || !/^\d+$/.test(amount)) {
        return null;
    }
    return Number(BigInt(amount)) / 10 ** coin.decimals;
}
