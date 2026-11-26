# Prospect pipeline

One seller used to take about ten minutes and a stack of screenshots: an agent read Facebook in a logged-in Chrome, wrote shop JSON by hand, built the shop, shot the English page, then sent Messenger. The slow part was looking at the page. This pipeline reads the listing data in one pass, fills only the fields that have no judgment in them, and leaves the rest as named flags.

Shops stay unclaimed and unpublished. The scripts never set `ownerUid` or `published`, never message a seller, and never write a shop another agent already holds.

## Decision

Attach Playwright to the Chrome the operator is already logged into (`connectOverCDP`), and read the listing records that page loads for itself.

| Approach | Why it lost |
|---|---|
| Screenshots plus a model | This is today's bottleneck. One image per scroll, then another pass to type the JSON. |
| A fresh browser that logs in, or a cookie export | Login automation and a new device profile are how accounts get checkpointed. |
| DOM and CSS classes only | Marketplace class names move. Kept as a fallback for `og:` tags and `/marketplace/item/` links. |
| Embedded JSON only | Item pages often ship a Relay payload. A profile grid pages in over GraphQL and usually omits the description. |
| Forged GraphQL from our own client | Extra calls, a separate session, and a shape we would have to keep authentic. |

The grabber listens to `/api/graphql` responses, parses embedded JSON in the HTML, and falls back to `og:title` / `og:description` / `og:image` plus item links. It does not invent a title or a price when those are missing. It does not open Marketplace search or category URLs. One seller, one tab, one run.

A profile scroll stops after two passes with no new listings, or six scrolls, or 40 listings (the shop-builder cap). Listings that already have a description and a large photo are not opened again. Thin grid cards are opened once, 1.8–3.2 seconds apart. Sold and pending rows are kept in the grab file and dropped at convert. Other sellers' "related" cards are dropped.

If Facebook redirects to `/login` or `/checkpoint`, the run stops and does not type anything. If the page says the account is going too fast, the run writes what it has with `stopped: "rate"` and exits 4. Many grabbers at once on the same account are out of scope.

Bundle posts are not split. A description with two or more priced lines (`Washing machine - 4000 yen`) is stored whole, and `bundleHint` is set. Splitting is a later edit.

## What is filled, and what is not

`scripts/prospect-convert.mjs` writes shop-builder JSON. It sets only:

- `externalSource` — `facebook_marketplace` plus `https://www.facebook.com/marketplace/profile/<id>` when the page exposes a profile id. Otherwise the entry URL, so a re-run hits the same shop.
- `settings.facebookUrl` — the entry URL when that URL is an item. When the entry is a profile, the first active listing URL. The reserve form needs this; an empty value means the buyer has no contact.
- Item `name` and `price` from the listing title when the title carries a yen amount, otherwise the structured yen price. A title price and a listing price that disagree become `price: null` plus a warning. `$` amounts are not treated as yen.
- Photos — one center square per source image, edge to edge, no padding, long side at most 1600, JPEG quality 82. The shop-builder CLI uploads them as `photoFiles`. Facebook CDN URLs are not sent as `photos`, because the API would rehost the uncropped frame and the URL expires.

It does not set:

| Field | Why it stays empty | How to finish it |
|---|---|---|
| `settings.slots` | "after 5pm" is the evening slot only (`20:00`). "5時以降" and a mix of morning and night are ambiguous. Empty slots display as 10:00, 14:00, and 20:00. | Copy `review.slots.hint` into `settings.slots`, or write the times you actually want. The build waits until `settings.slots` is set. |
| Bundle items | One post, many priced lines. The raw description is the item note. | Replace that item with one item per line, then set `review.bundlesDone` to `true`. Or set it true to ship the lump on purpose. The build waits. |
| `settings.address` | `wardAddress` strips one trailing 区 and always appends 区. `川口市` is stored as `川口市区`. `目黒` becomes `目黒区`, which is what the editor wants. | Leave it empty for a 市. Set it only when you mean a ward. This does not block the build. |
| `settings.pickupTo` | Pickup window and move-out are the same stored date. "月末" and "3月20日" are not a `YYYY-MM-DD`. | Set `pickupTo` when you know the last day. This does not block the build. |

`review` is local. `scripts/shop-builder.mjs` sends `externalSource`, `settings`, and `items` only.

Re-running convert refuses to overwrite `shop.json` unless `--force`. Edit the file in place so a filled `slots` array is not wiped.

## Commands

Chrome has to already be logged into Facebook. Quit it, then start that same profile with a debugging port. A fresh `--user-data-dir` is logged out, and the grabber will stop rather than log in.

```bash
# macOS — the everyday profile, after Chrome is quit
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome"
```

The port stays on localhost. The grabber will not attach to any other host, and it closes only the tab it opened. It does not call `browser.close()`.

```bash
node scripts/prospect-grab.mjs \
  --cdp http://127.0.0.1:9222 \
  --out data/prospects/seller.json \
  'https://www.facebook.com/marketplace/profile/SELLER_ID'
# or a list of item URLs, no profile

node scripts/prospect-convert.mjs data/prospects/seller.json
# edit data/prospects/<sellerId>/shop.json — slots, bundles, address

export SHOP_BUILDER_API_TOKEN=...          # shell only. Never print it. Never commit it.
export SHOP_BUILDER_AGENT_ID=grok-1
export SHOP_BUILDER_API_BASE=https://beta.sayonara.tokyo   # this is the default

node scripts/prospect-batch.mjs data/prospects --concurrency 4 --dry-run
node scripts/prospect-batch.mjs data/prospects --concurrency 4
```

`data/` is gitignored. Grab JSON, photos, screenshots, and the send queue contain seller data. The batch script warns if you point `--out` or `--queue` at a path inside the repo that is not under `data/`.

Batch defaults to beta. `https://sayonara.tokyo` is refused unless `--production` is passed. Builds of different sellers run together (the API is already parallel-safe), capped at 8. Screenshots then run one after another in a Chrome this script launches (`channel: "chrome"`, not the Facebook window): 1280×830, JPEG quality 82, `ss-lang=en` set before the page loads.

A shop is not built while `review.slots` is set and `settings.slots` is empty, or while a bundle is still open. Those rows land in `held`. A shop whose `lastAgentId` or live lease belongs to someone else, or that the API says is claimed (exit 3) or leased (exit 2), lands in `skipped` and is not written. Token values are stripped from anything the script prints.

## Send queue

`data/prospects/send-queue.json`:

```json
{
  "sends": [{
    "ready": true,
    "sellerId": "https://www.facebook.com/marketplace/profile/…",
    "threadUrl": "https://www.facebook.com/marketplace/item/…",
    "shopUrl": "https://beta.sayonara.tokyo/s/48291",
    "message": "…",
    "screenshot": "…/shots/48291.jpg",
    "checks": {
      "unclaimed": true,
      "unpublished": true,
      "facebookUrl": true,
      "photoCount": true,
      "english": true
    }
  }],
  "held": [],
  "skipped": [],
  "failed": []
}
```

`sends` is the back-to-back Messenger list: seller, thread URL, message, screenshot. This repo does not drive Messenger. Sending stays a separate pass in the logged-in Chrome so a bad row cannot be posted by the build script.

The message template is one string, `MESSAGE_TEMPLATE` in `scripts/prospect.mjs`. It is a placeholder.

## Verification

The shop-builder response already rejects a bad item, a stale revision, a claimed shop, and a shop leased by someone else. The batch does not check names, prices, notes, or lease expiry again.

After a build it GETs the shop and requires all of:

- `claimed === false` and `published === false`
- `settings.facebookUrl` equal to the value in the JSON
- photo count equal to the number of `photoFiles` uploaded

The screenshot then has to come back with `localStorage["ss-lang"] === "en"`, `<html lang="en">`, the nav reading "Help", the button reading "Request pickup", and no language splash. A miss stays out of `sends`.

## Time and tokens

These are estimates, not a measured run.

| | Today | This pipeline |
|---|---|---|
| Read the seller | Several minutes of screenshots, one model call per image | One pass. About 2–4 seconds plus 1.8–3.2 seconds of pause per thin listing. 15 listings is roughly 1–2 minutes. No model. |
| Write the shop | Hand-written JSON | Convert is a second. A person or a short text pass fills slots and bundles only when the text has those phrases. |
| Build | 60–150 seconds, already parallel-safe | Same per shop. Eight at once is about one shop's wait, not eight. |
| English screenshot | A separate Playwright step, already cheap | Same, batched after the builds. A few seconds each. No model. |
| Messenger | Interleaved with the reading | One queue, one Chrome session, one send after another. |

A seller with no time constraint and no bundle list does not need a model at all. The grab cannot be parallelized across sellers on one Facebook account; that serial wait is the remaining cost.

## Fallback

A grab that returns no listings, or `stopped: "rate"`, is a signal to use the old screenshot pass for that seller. Do not widen the grabber into a search crawl to compensate.

## Open questions

1. Is the placeholder message the one that should go out, or is there copy already in use?
2. When the input is a profile, `facebookUrl` is the first active listing, not the profile. The profile URL is the `sellerId`. Should the contact link be the profile instead?
3. `wardAddress("川口市")` stores `川口市区`, not `川口区`. Which string is showing up in the editor? The pipeline leaves address empty either way.
4. A post that never mentions a time is built with no `slots`, so the page shows 10:00, 14:00, and 20:00. Is that acceptable on the screenshot we send?
5. Should a later script paste the queue into Messenger, or does a person send from the queue?
6. Prospects stay on beta unless `--production` is passed. Is that the rule until you say otherwise?
