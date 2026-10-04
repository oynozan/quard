import { hasPayment, readPayment, readPrice, readSettlement } from "@quard/shared";
import type { Fetch } from "../../monitor/fetch.ts";
import { parseJson } from "../../monitor/json.ts";
import { isChecked } from "../checked.ts";
import {
    paidStep,
    recordPrice,
    recordRejected,
    recordRefused,
    recordSettlement,
    recordSigned,
    warnUnguarded,
    type PaidStep,
    type Place,
} from "../record/payments.ts";
import { UNGUARDED_REASON, unguardedResponse } from "../refusal.ts";
import { headersOf, placeOf, urlOf } from "./place.ts";

// A 402 with no price header may carry a v1 price in its body
async function priceOf(response: Response): Promise<ReturnType<typeof readPrice>> {
    const get = (name: string) => response.headers.get(name);
    return readPrice(get) ?? readPrice(get, parseJson(await response.clone().text()));
}

async function notePrice(place: Place, response: Response): Promise<void> {
    const price = await priceOf(response);
    if (price !== undefined) {
        recordPrice(place, price);
    }
}

// How a paid request ended: settled, failed, or turned down with a new 402
async function noteResult(step: PaidStep, response: Response): Promise<void> {
    const settlement = readSettlement((name) => response.headers.get(name));
    if (settlement !== undefined) {
        recordSettlement(step, settlement, response.status < 400);
    } else if (response.status === 402) {
        recordRejected(step, (await priceOf(response))?.error);
    }
}

// quard.x402Fetch(fetch): sits under an x402 client and records every
// price, payment and settlement. A payment no x402 guard checked is not sent.
export function createX402Fetch(inner: Fetch): Fetch {
    return async (input, init) => {
        const place = placeOf(urlOf(input));
        const headers = headersOf(input, init);
        const get = (name: string) => headers.get(name);
        if (!hasPayment(get)) {
            const response = await inner(input, init);
            if (response.status === 402) {
                await notePrice(place, response);
            }
            return response;
        }
        const payment = readPayment(get);
        const step = paidStep(place, payment);
        if (payment === undefined || !isChecked(payment)) {
            recordRefused(step, UNGUARDED_REASON);
            warnUnguarded(step);
            return unguardedResponse();
        }
        recordSigned(step);
        const response = await inner(input, init);
        await noteResult(step, response);
        return response;
    };
}
