"use client";
import { useRouter } from "next/navigation";
import { AccountView } from "@/components/account-view";
import { adminPath } from "@/lib/shop";

export default function MePage() {
  const router = useRouter();
  return (
    <main className="wrap">
      <AccountView
        onLoginDone={(id) => { if (id) router.push(adminPath(id)); }}
      />
    </main>
  );
}
