// A German IBAN with random digits and a valid mod-97 check
export function newIban(): string {
    const account = Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");
    // The check reads "DE00" at the end, with D as 13 and E as 14
    const check = 98n - (BigInt(`${account}131400`) % 97n);
    const iban = `DE${String(check).padStart(2, "0")}${account}`;
    return iban.replace(/(.{4})/g, "$1 ").trim();
}
