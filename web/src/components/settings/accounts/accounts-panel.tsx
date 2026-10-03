import { DataTable, TableState } from "@/components/kit/data-table";
import { Cols, Head } from "../shared/table-parts";

const WIDTHS = ["50%", "20%", "30%"];

// Sign-in is open, so there are no accounts or roles to manage
export function AccountsPanel() {
    return (
        <section aria-label="Accounts">
            <DataTable className="text-[14px]">
                <caption className="sr-only">Accounts</caption>
                <Cols widths={WIDTHS} />
                <Head first="Person" rest={["Added", "Last sign-in"]} />
                <tbody />
            </DataTable>
            <TableState title="No accounts to manage" body="Anyone who signs in with email or GitHub can use Quard." />
        </section>
    );
}
