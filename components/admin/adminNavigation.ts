import type { ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";

export type AdminRouteItem = {
  href: string;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
};

export const ADMIN_ROUTES: AdminRouteItem[] = [
  { href: "/admin", label: "Overview", icon: "grid" },
  { href: "/admin/analytics", label: "Analytics Lab", icon: "bar-chart-2" },
  { href: "/admin/users", label: "User Ops", icon: "users" },
  { href: "/admin/ai-ops", label: "AI Ops", icon: "cpu" },
  { href: "/admin/system", label: "System Health", icon: "activity" },
  { href: "/admin/audit", label: "Audit Log", icon: "file-text" },
];

export const ADMIN_ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  "/admin": {
    title: "Overview",
    subtitle: "Track platform health, usage, and cost with period-over-period comparison.",
  },
  "/admin/analytics": {
    title: "Analytics Lab",
    subtitle:
      "Compare trends and cohorts across billing, lifecycle, behavior, provider, and capability.",
  },
  "/admin/users": {
    title: "User Ops",
    subtitle: "Operational metadata, abuse-watch controls, and secure session actions.",
  },
  "/admin/ai-ops": {
    title: "AI Ops",
    subtitle: "Model reliability, latency, spend concentration, and routing controls.",
  },
  "/admin/system": {
    title: "System Health",
    subtitle: "Threshold alerts, incidents, and non-destructive maintenance jobs.",
  },
  "/admin/audit": {
    title: "Audit Log",
    subtitle: "Admin action trail for accountable and traceable operations.",
  },
};
