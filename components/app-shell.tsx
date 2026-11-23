"use client";
import AppNav from "@/components/app-nav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
