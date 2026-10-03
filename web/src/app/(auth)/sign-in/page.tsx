import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
    return (
        <AuthCard classifier="Sign in" meta="acme-prod">
            <SignInForm />
        </AuthCard>
    );
}
