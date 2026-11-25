"use client";
import ShopBuyerView from "@/components/buyer-ui";
import { ELTON_ID } from "@/lib/shop";

export default function EltonBuyer() {
  return <ShopBuyerView shop={ELTON_ID} />;
}
