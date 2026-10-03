"use client";

import { UserRound, UserPlus } from "lucide-react";
import { useState } from "react";
import { DataTable, NameCell, TableState, Td, Tr } from "@/components/kit/data-table";
import { Absent } from "@/components/kit/detail/detail-list";
import { Badge } from "@/components/kit/labels";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/data/settings";
import { LiveNote, PanelIntro } from "../shared/panel-intro";
import { Ago, Cols, FIRST_CELL, Head, ShortDate } from "../shared/table-parts";
import { InviteDrawer } from "./invite-drawer";
import { ROLE_WORD } from "./roles";

type Row = Account & { invited?: boolean };

type AccountsPanelProps = { accounts: Account[]; me: string; now: number };

const WIDTHS = ["36%", "18%", "18%", "28%"];

export function AccountsPanel({ accounts, me, now }: AccountsPanelProps) {
    const [rows, setRows] = useState<Row[]>(accounts);
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const admins = rows.filter((row) => row.role === "admin").length;

    function invited(email: string, role: Account["role"]) {
        const row: Row = { email, name: email.split("@")[0], role, createdAt: now, lastSignInAt: null, invited: true };
        setRows((list) => [row, ...list]);
        setNote(`Invite sent to ${email} as ${ROLE_WORD[role].toLowerCase()}.`);
    }

    return (
        <section aria-label="Accounts and roles">
            <PanelIntro
                action={
                    <Button onClick={() => setOpen(true)}>
                        <UserPlus size={16} strokeWidth={0.75} />
                        Invite
                    </Button>
                }
            />

            <DataTable minWidth={760} className="text-[14px]">
                <caption className="sr-only">
                    Accounts: {admins} admins and {rows.length - admins} approvers
                </caption>
                <Cols widths={WIDTHS} />
                <Head first="Person" rest={["Role", "Added", "Last sign-in"]} />
                <tbody>
                    {rows.map((row) => (
                        <Tr key={row.email}>
                            <Td colSpan={2} className={FIRST_CELL}>
                                <NameCell
                                    icon={<UserRound size={20} strokeWidth={0.75} className="opacity-80" />}
                                    name={
                                        <>
                                            {row.invited ? <Absent>{row.name}</Absent> : row.name}
                                            {row.email === me ? (
                                                <span className="ml-2 text-[12px] font-normal text-ink-muted">You</span>
                                            ) : null}
                                        </>
                                    }
                                    sub={<span className="mono text-[12px]">{row.email}</span>}
                                />
                            </Td>
                            <Td>
                                <Badge>{ROLE_WORD[row.role]}</Badge>
                            </Td>
                            <Td>
                                <ShortDate time={row.createdAt} />
                            </Td>
                            <Td>
                                {row.lastSignInAt !== null ? (
                                    <Ago time={row.lastSignInAt} now={now} />
                                ) : (
                                    <span className="text-[12px]">
                                        <Absent>{row.invited ? "Invite sent" : "Never signed in"}</Absent>
                                    </span>
                                )}
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {rows.length === 0 ? <TableState title="No accounts" body="Invite people to answer approvals." /> : null}

            <LiveNote message={note} />
            <InviteDrawer open={open} onOpenChange={setOpen} taken={rows.map((row) => row.email)} onInvited={invited} />
        </section>
    );
}
