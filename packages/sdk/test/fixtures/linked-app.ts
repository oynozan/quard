import { guard, quard } from "../../index.ts";

// An app for the exit tests that ends only when nothing keeps Node alive
quard.configure({
    key: process.env.QUARD_TEST_KEY,
    controlUrl: process.env.QUARD_TEST_CONTROL_URL,
    hashKey: "ab".repeat(32),
});

if (process.env.QUARD_TEST_MODE === "idle") {
    // Long enough for the link to connect
    setTimeout(() => console.log("work done"), 300);
} else {
    const payInvoice = guard(async (input: { amount: number }) => `paid ${input.amount}`, {
        type: "approval",
        name: "payInvoice",
    });
    console.log(String(await payInvoice({ amount: 4950 })));
}
