"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ShopBuyerView from "@/components/buyer-ui";
import { getId, getName } from "@/lib/shop";

export default function ShopBuyer() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const id = slug || "";
  const [label, setLabel] = useState(id);

  useEffect(() => {
    if (id === "elton") { router.replace("/s/elton"); return; }
    setLabel(getId() === id ? (getName() || id) : id);
  }, [id, router]);

  if (!id || id === "elton") return null;
  return <ShopBuyerView shop={id} name={label} />;
}
