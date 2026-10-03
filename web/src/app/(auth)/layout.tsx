// Pages outside the app shell: no sidebar, one centered card
export default function AuthLayout({ children }: LayoutProps<"/">) {
    return (
        <main
            id="content"
            className="flex min-h-dvh flex-col justify-center bg-page px-6 py-12 max-[620px]:px-4 max-[620px]:py-5"
        >
            {children}
        </main>
    );
}
