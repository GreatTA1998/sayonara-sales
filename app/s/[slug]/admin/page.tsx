"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import ShopAdminView from "@/components/admin-ui";
import { getId, getName, subscribeAuth } from "@/lib/shop";

export default function ShopAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const id = slug || "";
  const soft = useSyncExternalStore(subscribeAuth, getName, () => "");
  const myId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const label = myId === id ? soft : "";

  useEffect(() => {
    if (id === "elton") router.replace("/admin");
  }, [id, router]);

  if (!id || id === "elton") return null;
  return <ShopAdminView shop={id} name={label} />;
}
