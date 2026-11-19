"use client";
import ShopAdminView from "@/components/admin-ui";
import { SHOP_NAME } from "@/lib/sale";
import { ELTON_ID } from "@/lib/shop";

export default function AdminPage() {
  return <ShopAdminView shop={ELTON_ID} name={SHOP_NAME} />;
}
