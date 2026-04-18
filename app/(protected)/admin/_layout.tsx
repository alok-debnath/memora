import React from "react";
import { Slot } from "expo-router";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { AdminStateProvider } from "@/components/admin/AdminStateContext";

export default function AdminLayout() {
  return (
    <AdminStateProvider>
      <AdminLayoutShell>
        <Slot />
      </AdminLayoutShell>
    </AdminStateProvider>
  );
}
