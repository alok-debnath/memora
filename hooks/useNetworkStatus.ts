import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Reachability for offline UX. Convex reconnects its websocket automatically;
 * this only drives the visual affordance (OfflineBanner).
 */
export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable stays null while unknown — treat unknown as online
      // to avoid flashing the banner on cold start.
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  return { isOffline };
}
