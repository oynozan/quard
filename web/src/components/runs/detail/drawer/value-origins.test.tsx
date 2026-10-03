import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { START, TRUSTED, makeAppearance, makeArg } from "../../../../../test/runs-detail-list/fixtures";
import { ValueOrigins } from "./value-origins";

function items() {
    return screen.getAllByRole("listitem").map((item) => item.textContent);
}

describe("ValueOrigins", () => {
    it("says there are no arguments when the call had none", () => {
        render(<ValueOrigins args={[]} startedAt={START} />);
        expect(screen.getByText("No arguments")).toBeTruthy();
        expect(screen.queryByRole("list")).toBeNull();
    });

    it("shows where a traced value was first seen, when and how it matched", () => {
        render(<ValueOrigins args={[makeArg()]} startedAt={START} />);
        expect(items()).toEqual(["ibanibanGB33…5555First seen inweb:acme.netuntrustedbilling · 3.0 s · exact match"]);
    });

    it("counts the later appearances and marks a masked value", () => {
        const arg = makeArg({
            name: "to",
            value: "a•••@acme.net",
            masked: true,
            valueLabel: {
                kind: "email",
                traced: true,
                generated: false,
                appearances: [
                    makeAppearance({ label: TRUSTED, agent: "mailer", at: START + 420, match: "host" }),
                    makeAppearance(),
                    makeAppearance(),
                ],
            },
        });
        render(<ValueOrigins args={[arg]} startedAt={START} />);
        expect(items()).toEqual([
            "toemail · maskeda•••@acme.netFirst seen insystemtrustedmailer · 0.42 s · same host · +2 more",
        ]);
    });

    it("marks a value as model-generated when the model wrote it or it was never seen", () => {
        const generated = makeArg({
            name: "amount",
            valueLabel: { kind: "id", traced: true, generated: true, appearances: [] },
        });
        const unseen = makeArg({
            name: "ref",
            valueLabel: { kind: "id", traced: true, generated: false, appearances: [] },
        });
        render(<ValueOrigins args={[generated, unseen]} startedAt={START} />);
        expect(items()).toEqual(["amountidGB33…5555model-generated", "refidGB33…5555model-generated"]);
    });

    it("says an untraced value was not traced", () => {
        const arg = makeArg({
            name: "memo",
            value: "Invoice 114",
            valueLabel: { kind: "text", traced: false, generated: false, appearances: [] },
        });
        render(<ValueOrigins args={[arg]} startedAt={START} />);
        expect(items()).toEqual(["memotextInvoice 114not traced"]);
    });
});
