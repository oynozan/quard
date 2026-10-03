import { EmptyLine } from "@/components/kit/empty";

// Sign-in is open, so there are no accounts or roles to manage
export function AccountsPanel() {
    return (
        <section aria-label="Accounts">
            <EmptyLine>Anyone who signs in with email or GitHub can use Quard</EmptyLine>
        </section>
    );
}
