"use client";
import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import ShopAdminView from "@/components/admin-ui";
import { ELTON_LABEL, getId, getName, subscribeAuth } from "@/lib/shop";

export default function ShopAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const id = slug || "";
  const soft = useSyncExternalStore(subscribeAuth, getName, () => "");
  const myId = useSyncExternalStore(subscribeAuth, getId, () => "");
  const label = id === "elton" ? ELTON_LABEL : myId === id ? soft : "";
  if (!id) return null;
  return <ShopAdminView shop={id} name={label} />;
}
