"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import BuyerUi from "@/components/buyer-ui";
import { getId, getName } from "@/lib/shop";

export default function ShopBuyer() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const id = slug || "";
  const [label, setLabel] = useState(id);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    if (id === "elton") { router.replace("/s/elton"); return; }
    const m = getId() === id;
    setMine(m);
    setLabel(m ? (getName() || id) : id);
  }, [id, router]);

  if (!id || id === "elton") return null;
  return <BuyerUi shop={id} name={label} home adminHref={mine ? `/s/${id}/admin` : undefined} />;
}
