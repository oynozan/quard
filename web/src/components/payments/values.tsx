import { Absent } from "@/components/kit/detail/detail-list";
import { TextLink } from "@/components/kit/links";
import { formatCost } from "@/lib/format";
import { txUrl } from "./lib/networks";
import { shortAddress } from "./lib/words";

// A run's settled x402 spend. "Unknown" when a settled token has no USD value.
export function SpendValue({ usd = 0, known = true }: { usd?: number; known?: boolean }) {
    if (!known) {
        const title = usd > 0 ? `${formatCost(usd)} plus tokens with no known USD value` : "No known USD value";
        return <span title={title}>Unknown</span>;
    }
    return usd > 0 ? <>{formatCost(usd)}</> : <Absent>None</Absent>;
}

// A wallet address, shortened, with the full address on hover
export function Payee({ address }: { address: string }) {
    return (
        <span className="mono" title={address}>
            {shortAddress(address)}
        </span>
    );
}

// The USD value when known, over the exact amount in atomic units
export function PaymentAmount({ usd, amount }: { usd: number | null; amount: string }) {
    return (
        <span className="flex min-w-0 flex-col">
            <span className="mono text-[13px] text-ink">
                {usd === null ? <Absent>Value unknown</Absent> : formatCost(usd)}
            </span>
            <small className="mono -mt-px truncate text-[11px] text-ink-note" title={`${amount} atomic units`}>
                {amount} atomic
            </small>
        </span>
    );
}

// A transaction hash, linked to a block explorer when the network is a known one
export function TxLink({ network, hash }: { network: string; hash: string | null }) {
    if (!hash) return <Absent>None</Absent>;
    const url = txUrl(network, hash);
    if (!url) {
        return (
            <span className="mono" title={hash}>
                {shortAddress(hash)}
            </span>
        );
    }
    return (
        <TextLink mono href={url} target="_blank" rel="noreferrer" title={hash}>
            {shortAddress(hash)}
        </TextLink>
    );
}
