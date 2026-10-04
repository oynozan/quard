type Network = { name: string; tx: (hash: string) => string };

const scan =
    (base: string, suffix = "") =>
    (hash: string) =>
        `${base}/tx/${hash}${suffix}`;

const BASE: Network = { name: "Base", tx: scan("https://basescan.org") };
const BASE_SEPOLIA: Network = { name: "Base Sepolia", tx: scan("https://sepolia.basescan.org") };
const POLYGON: Network = { name: "Polygon", tx: scan("https://polygonscan.com") };
const AVALANCHE: Network = { name: "Avalanche", tx: scan("https://snowtrace.io") };
const SOLANA: Network = { name: "Solana", tx: scan("https://solscan.io") };
const SOLANA_DEVNET: Network = { name: "Solana devnet", tx: scan("https://solscan.io", "?cluster=devnet") };

// A short list of well-known networks, by x402 v2 (CAIP-2) and v1 names
const NETWORKS: Record<string, Network> = {
    "eip155:8453": BASE,
    "eip155:84532": BASE_SEPOLIA,
    "eip155:1": { name: "Ethereum", tx: scan("https://etherscan.io") },
    "eip155:137": POLYGON,
    "eip155:43114": AVALANCHE,
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": SOLANA,
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": SOLANA_DEVNET,
    base: BASE,
    "base-sepolia": BASE_SEPOLIA,
    polygon: POLYGON,
    avalanche: AVALANCHE,
    solana: SOLANA,
    "solana-devnet": SOLANA_DEVNET,
};

const find = (network: string): Network | undefined =>
    Object.hasOwn(NETWORKS, network) ? NETWORKS[network] : undefined;

// A readable name for a known network, else the network as recorded
export function networkName(network: string): string {
    return find(network)?.name ?? network;
}

// A block explorer link for a known network and a plain hash, else null
export function txUrl(network: string, hash: string): string | null {
    const known = find(network);
    return known && /^[A-Za-z0-9]+$/.test(hash) ? known.tx(hash) : null;
}
