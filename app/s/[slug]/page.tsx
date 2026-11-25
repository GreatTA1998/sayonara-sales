"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ShopBuyerView from "@/components/buyer-ui";

export default function ShopBuyer() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const id = slug || "";

  useEffect(() => {
    if (id === "elton") router.replace("/s/elton");
  }, [id, router]);

  if (!id || id === "elton") return null;
  return <ShopBuyerView shop={id} />;
}
