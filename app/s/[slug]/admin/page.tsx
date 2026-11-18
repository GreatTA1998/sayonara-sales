"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminUi from "@/components/admin-ui";
import { getId, getName } from "@/lib/shop";

export default function ShopAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const id = slug || "";
  const [label, setLabel] = useState(id);

  useEffect(() => {
    if (id === "elton") { router.replace("/admin"); return; }
    setLabel(getId() === id ? (getName() || id) : id);
  }, [id, router]);

  if (!id || id === "elton") return null;
  return <AdminUi shop={id} name={label || id} home />;
}
