"use client";
import AdminUi from "@/components/admin-ui";
import { SHOP_NAME } from "@/lib/sale";
import { ELTON_ID } from "@/lib/shop";

/** Elton admin — legacy path; blob key sayonara-store.json */
export default function AdminPage() {
  return <AdminUi shop={ELTON_ID} name={SHOP_NAME} home />;
}
