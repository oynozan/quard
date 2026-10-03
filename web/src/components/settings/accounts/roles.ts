import type { Account } from "@/lib/data/settings";

export const ROLE_WORD: Record<Account["role"], string> = { admin: "Admin", approver: "Approver" };

export const ROLE_HELP: Record<Account["role"], string> = {
    admin: "Also manages settings",
    approver: "Answers approvals only",
};
