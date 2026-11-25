"use client";
import { useEffect } from "react";
import AppNav from "@/components/app-nav";
import LangSplash from "@/components/lang-splash";
import { isJa, useLang } from "@/lib/lang";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = isJa(lang) ? "ja" : lang;
  }, [lang]);
  return (
    <>
      <AppNav />
      {children}
      <LangSplash />
    </>
  );
}
