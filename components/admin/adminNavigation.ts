import type { ComponentProps } from "react";
import { Feather } from "@/lib/icons";

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
