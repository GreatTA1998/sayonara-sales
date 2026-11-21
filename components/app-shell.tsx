"use client";
import { usePathname } from "next/navigation";
import AppNav from "@/components/app-nav";

/** Keeps AppNav + soft identity mounted across routes (no remount flash). */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  return (
    <>
      <AppNav top={path === "/"} />
      {children}
    </>
  );
}
