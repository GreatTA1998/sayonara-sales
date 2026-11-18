"use client";
import BuyerUi from "@/components/buyer-ui";
import { SHOP_NAME } from "@/lib/sale";
import { ELTON_ID } from "@/lib/shop";

/** Elton buyer — separate from hub / independent shops. */
export default function EltonBuyer() {
  return <BuyerUi shop={ELTON_ID} name={SHOP_NAME} home />;
}
