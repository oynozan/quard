"use server";

import { decideApproval, revokeGrant, type DecideResult } from "@quard/db";
import { revalidatePath } from "next/cache";
import { displayName } from "@/lib/auth/access";
import { actionScope } from "../scope";
import type { ApprovalCode } from "./types";

const REQUEST_ID = /^apr_[0-9a-f]{16}$/;
const GRANT_ID = /^grt_[0-9a-f]{16}$/;
const CODES: readonly unknown[] = ["once", "always", "deny"];

// An approver's answer, saved with who gave it. Control hears it and tells the waiting calls.
export async function answerApproval(requestId: string, answer: ApprovalCode): Promise<DecideResult> {
    const scope = await actionScope();
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId) || !CODES.includes(answer)) {
        throw new Error("Not an approval answer");
    }
    const result = scope
        ? await decideApproval(scope.db, scope.project.id, requestId, answer, displayName(scope.session))
        : "not_found";
    revalidatePath("/approvals");
    return result;
}

// Ends an "always approve", so later identical calls ask again. False when it was already revoked.
export async function revokeAlwaysGrant(grantId: string): Promise<boolean> {
    const scope = await actionScope();
    if (typeof grantId !== "string" || !GRANT_ID.test(grantId)) {
        throw new Error("Not a grant id");
    }
    const revoked = scope ? await revokeGrant(scope.db, scope.project.id, grantId, displayName(scope.session)) : false;
    revalidatePath("/approvals");
    return revoked;
}
