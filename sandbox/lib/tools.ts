import type OpenAI from "openai";

// What the model is told about each tool. Every field is required.
type Fields = Record<string, [type: "string" | "number", description: string]>;

function define(name: string, description: string, fields: Fields): OpenAI.Responses.FunctionTool {
    const properties = Object.fromEntries(
        Object.entries(fields).map(([key, [type, about]]) => [key, { type, description: about }]),
    );
    return {
        type: "function",
        name,
        description,
        parameters: { type: "object", properties, required: Object.keys(fields), additionalProperties: false },
        strict: true,
    };
}

const TOOLS = [
    define("sendSms", "Send one text message", { to: ["string", "Phone number"], text: ["string", "Message text"] }),
    define("getSupplier", "Look up a supplier in our records, with its bank details", {
        name: ["string", "Supplier name"],
    }),
    define("fetchPage", "Read a web page", { url: ["string", "Full URL"] }),
    define("fetchPaid", "Fetch a URL from a paid API. It pays with x402 when the server asks", {
        url: ["string", "Full URL"],
    }),
    define("readEmail", "Read the newest email in the inbox", {}),
    define("payInvoice", "Pay an invoice by bank transfer", {
        iban: ["string", "IBAN to pay"],
        amount: ["number", "Amount in EUR"],
    }),
    define("getCustomers", "Read our customer list", {}),
    define("sendEmail", "Send an email", { to: ["string", "Recipient address"], body: ["string", "Email text"] }),
    define("lookupOrder", "Look up an order", { orderId: ["string", "Order number"] }),
    define("refundOrder", "Refund an order in full", { orderId: ["string", "Order number"] }),
    define("notifyPartner", "Send a message to a partner company", {
        partner: ["string", "Partner name, such as globex or initech"],
        message: ["string", "Message text"],
    }),
    define("crmLookup", "Look up a company in our CRM", { company: ["string", "Company name"] }),
    define("delegate", "Hand a task to another agent and get its reply", {
        to: ["string", "Agent name"],
        brief: ["string", "What the agent should do, with every detail it needs"],
    }),
    define("readMessage", "Read the newest message from another agent", {}),
    define("sendMessage", "Send a message to another agent", {
        to: ["string", "Agent name"],
        text: ["string", "Message text"],
    }),
    define("saveNote", "Save a note for later", { key: ["string", "Short name"], text: ["string", "Note text"] }),
    define("readNote", "Read a saved note", { key: ["string", "Short name"] }),
    define("runShell", "Run one shell command in the project and return its output", {
        command: ["string", "The exact shell command to run"],
    }),
];

export function definitions(names: string[]): OpenAI.Responses.FunctionTool[] {
    return names.map((name) => {
        const found = TOOLS.find((tool) => tool.name === name);
        if (found === undefined) {
            throw new Error(`lib/tools.ts has no definition for ${name}`);
        }
        return found;
    });
}
