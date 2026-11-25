"use client";
import { useEffect } from "react";
import AppNav from "@/components/app-nav";
import LangSplash from "@/components/lang-splash";
import { applyLangDom, useLang } from "@/lib/lang";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  useEffect(() => { applyLangDom(lang); }, [lang]);
  return (
    <>
      <AppNav />
      {children}
      <LangSplash />
    </>
  );
}
