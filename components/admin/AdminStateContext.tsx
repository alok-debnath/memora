import React from "react";

export type RangeKey = "7d" | "30d" | "90d" | "365d";
export type SegmentKey = "billing" | "behavior" | "lifecycle" | "provider" | "capability";
export type CompareMode = "off" | "previous";
export type AdminWorkflow = "overview" | "analytics" | "users" | "ai-ops" | "system" | "audit";

export type AdminSelectedEntity = {
  type: "user" | "incident" | "provider" | "model" | "action";
  id: string;
} | null;

type AdminStateValue = {
  range: RangeKey;
  setRange: React.Dispatch<React.SetStateAction<RangeKey>>;
  compareMode: CompareMode;
  setCompareMode: React.Dispatch<React.SetStateAction<CompareMode>>;
  segmentFamily: SegmentKey;
  setSegmentFamily: React.Dispatch<React.SetStateAction<SegmentKey>>;
  refreshKey: number;
  triggerRefresh: () => void;
  selectedTimepoint: string | null;
  setSelectedTimepoint: React.Dispatch<React.SetStateAction<string | null>>;
  selectedEntity: AdminSelectedEntity;
  setSelectedEntity: React.Dispatch<React.SetStateAction<AdminSelectedEntity>>;
  activeWorkflow: AdminWorkflow;
  setActiveWorkflow: React.Dispatch<React.SetStateAction<AdminWorkflow>>;
};

const AdminStateContext = React.createContext<AdminStateValue | null>(null);

export function AdminStateProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<RangeKey>("7d");
  const [compareMode, setCompareMode] = React.useState<CompareMode>("previous");
  const [segmentFamily, setSegmentFamily] = React.useState<SegmentKey>("billing");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectedTimepoint, setSelectedTimepoint] = React.useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = React.useState<AdminSelectedEntity>(null);
  const [activeWorkflow, setActiveWorkflow] = React.useState<AdminWorkflow>("overview");

  const triggerRefresh = React.useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const value = React.useMemo(
    () => ({
      range,
      setRange,
      compareMode,
      setCompareMode,
      segmentFamily,
      setSegmentFamily,
      refreshKey,
      triggerRefresh,
      selectedTimepoint,
      setSelectedTimepoint,
      selectedEntity,
      setSelectedEntity,
      activeWorkflow,
      setActiveWorkflow,
    }),
    [
      range,
      compareMode,
      segmentFamily,
      refreshKey,
      triggerRefresh,
      selectedTimepoint,
      selectedEntity,
      activeWorkflow,
    ],
  );

  return <AdminStateContext.Provider value={value}>{children}</AdminStateContext.Provider>;
}

export function useAdminState() {
  const context = React.useContext(AdminStateContext);
  if (!context) {
    throw new Error("useAdminState must be used within AdminStateProvider");
  }
  return context;
}
