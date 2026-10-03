import { Globe, Landmark, Mail } from "lucide-react";
import { NameCell } from "@/components/kit/data-table";
import type { QuarantinedValue } from "@/lib/data/fleet";

export const KIND_NAMES: Record<QuarantinedValue["kind"], string> = { iban: "IBAN", email: "Email", domain: "Domain" };

const ICONS = { iban: Landmark, email: Mail, domain: Globe };

// A masked value with its kind icon and field
export function ValueCell({ value }: { value: Pick<QuarantinedValue, "kind" | "field" | "value"> }) {
    const Icon = ICONS[value.kind];
    return (
        <span title={`${KIND_NAMES[value.kind]} ${value.value}`}>
            <NameCell
                icon={<Icon size={18} strokeWidth={0.75} aria-hidden />}
                name={value.value}
                mono
                sub={value.field}
            />
        </span>
    );
}
