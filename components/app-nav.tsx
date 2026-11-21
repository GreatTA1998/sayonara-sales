"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { useLineOAuthReturn } from "@/components/line-oauth";
import { adminPath, ensureShopId, getId, getName, subscribeAuth } from "@/lib/shop";

type Props = { top?: boolean };

/** logo+サヨナラ | 投稿/投稿一覧 | ログイン/name → マイページ */
export default function AppNav({ top }: Props) {
  const router = useRouter();
  const path = usePathname() || "";
  const name = useSyncExternalStore(subscribeAuth, getName, () => "");
  const shopId = useSyncExternalStore(subscribeAuth, getId, () => "");

  useEffect(() => {
    router.prefetch(shopId ? adminPath(shopId) : "/admin");
    router.prefetch("/me");
  }, [shopId, router]);
  useLineOAuthReturn();

  const sellHref = shopId ? adminPath(shopId) : "/admin";
  const sellOn = path === "/admin" || /\/admin\/?$/.test(path);
  const meOn = path === "/me" || path.startsWith("/me/");

  return (
    <nav className={`app-nav${top ? " top" : " bot"}`} aria-label="アプリ">
      <div className="app-nav-inner">
        <Link href="/" className="brand" prefetch aria-label="サヨナラ ホーム">
          <img className="logo" src="/sun-logo.png" alt="" width={52} height={27} decoding="async" />
          <span>サヨナラ</span>
        </Link>
        <Link className={`nav-a${sellOn ? " on" : ""}`} href={sellHref} prefetch
          aria-current={sellOn ? "page" : undefined}
          onClick={(e) => {
            if (shopId) return;
            e.preventDefault();
            router.push(adminPath(ensureShopId()));
          }}>{name ? "投稿一覧" : "投稿"}</Link>
        <Link className={`nav-a${meOn ? " on" : ""}`} href="/me" prefetch
          aria-current={meOn ? "page" : undefined}>{name || "ログイン"}</Link>
      </div>
    </nav>
  );
}
