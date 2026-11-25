import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { LIMITS } from "../lib/shop-limits";
import { ITEM_WRITE_KEYS, PICKUP_SPOT_KEYS, SHOP_SETTING_KEYS, SHOP_SETTING_READ_KEYS } from "../lib/store";

const spec = parse(readFileSync(new URL("../docs/api/shop-builder.openapi.yaml", import.meta.url), "utf8")) as {
  openapi: string;
  info: { "x-limits": Record<string, number> };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean }> };
};

assert.equal(spec.openapi, "3.1.0");
const props = (name: string) => Object.keys(spec.components.schemas[name].properties || {});
assert.deepEqual(props("ShopSettings"), [...SHOP_SETTING_KEYS]);
assert.deepEqual(props("ItemWrite"), [...ITEM_WRITE_KEYS]);
assert.deepEqual(props("PickupSpot"), [...PICKUP_SPOT_KEYS]);
assert.equal(spec.components.schemas.ShopSettings.additionalProperties, false);
assert.equal(spec.components.schemas.ItemWrite.additionalProperties, false);
assert.deepEqual(spec.info["x-limits"], { ...LIMITS });

const shopSettings = spec.components.schemas.Shop.properties?.settings as {
  allOf?: { properties?: Record<string, unknown> }[];
};
const readOnly = shopSettings.allOf?.[1]?.properties || {};
for (const key of SHOP_SETTING_READ_KEYS) assert.ok(readOnly[key], key);

for (const p of [
  "/api/shop-builder/shops",
  "/api/shop-builder/shops/{shopId}",
  "/api/shop-builder/shops/{shopId}/lease",
  "/api/shop-builder/shops/{shopId}/items",
  "/api/shop-builder/shops/{shopId}/items/{itemKey}",
  "/api/shop-builder/shops/{shopId}/photos",
]) assert.ok(spec.paths[p], p);

assert.ok(spec.paths["/api/shop-builder/shops"].post);
assert.ok(spec.paths["/api/shop-builder/shops"].get);
assert.ok(spec.paths["/api/shop-builder/shops/{shopId}/items/{itemKey}"].put);
assert.ok(spec.paths["/api/shop-builder/shops/{shopId}/items/{itemKey}"].delete);
assert.ok(spec.paths["/api/shop-builder/shops/{shopId}/lease"].post);
assert.ok(spec.paths["/api/shop-builder/shops/{shopId}/lease"].delete);
console.log("spec ok");
