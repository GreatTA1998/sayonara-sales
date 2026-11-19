"use client";
import ShopBuyerView from "@/components/buyer-ui";
import { SHOP_NAME } from "@/lib/sale";
import { ELTON_ID } from "@/lib/shop";

export default function EltonBuyer() {
  return <ShopBuyerView shop={ELTON_ID} name={SHOP_NAME} />;
}
