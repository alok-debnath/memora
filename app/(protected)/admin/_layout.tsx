import React from "react";
import { Slot } from "expo-router";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { AdminStateProvider } from "@/components/admin/AdminStateContext";
import { ScreenErrorBoundary } from "@/components/ui/ScreenErrorBoundary";

export default function AdminLayout() {
  return (
    <AdminStateProvider>
      <AdminLayoutShell>
        <ScreenErrorBoundary label="Admin panel">
          <Slot />
        </ScreenErrorBoundary>
      </AdminLayoutShell>
    </AdminStateProvider>
  );
}
