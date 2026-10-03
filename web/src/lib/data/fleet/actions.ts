"use server";

import { markValueKnown } from "@quard/db";
import { revalidatePath } from "next/cache";
import { displayName } from "@/lib/auth/access";
import { actionScope } from "../scope";

// "iban:DE89…3000#<hash>" or "email:j…@acme.com#<hash>", or a plain "domain:acme.com"
const FLEET_KEY = /^(?:(?:iban|email):[^#\s]+#[0-9a-f]{32}|domain:[a-z0-9.-]+)$/;

// Someone checked a quarantined value and says it is fine. Control lifts the block on every SDK.
// False when the project has no such value.
export async function markKnown(key: string): Promise<boolean> {
    const scope = await actionScope();
    if (typeof key !== "string" || key.length > 500 || !FLEET_KEY.test(key)) {
        throw new Error("Not a fleet value key");
    }
    const known = scope ? await markValueKnown(scope.db, scope.project.id, key, displayName(scope.session)) : false;
    revalidatePath("/summary");
    return known;
}
