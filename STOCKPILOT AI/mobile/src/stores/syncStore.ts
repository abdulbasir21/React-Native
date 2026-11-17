import { create } from 'zustand';
import { getLocalSyncState, listLocalOutboxEntries } from '../db/localServices';
import { runSyncCycle } from '../sync/syncEngine';

interface SyncStoreState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  needsReviewCount: number;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  lastWarnings: string[];
  setOnline: (online: boolean) => void;
  refreshStatus: (shopId: string) => Promise<void>;
  triggerSync: (shopId: string) => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  isOnline: true,
  isOnlineInitialized: false,
  isSyncing: false,
  pendingCount: 0,
  needsReviewCount: 0,
  lastSuccessfulSyncAt: null,
  lastError: null,
  lastWarnings: [],

  setOnline(online) {
    set({ isOnline: online });
  },

  async refreshStatus(shopId) {
    try {
      const [entries, state] = await Promise.all([
        listLocalOutboxEntries(shopId),
        getLocalSyncState(shopId),
      ]);
      const pendingCount = entries.filter(
        (e) => e.status === 'PENDING' || e.status === 'FAILED' || e.status === 'IN_FLIGHT',
      ).length;
      const needsReviewCount = entries.filter((e) => e.status === 'NEEDS_REVIEW').length;
      set({
        pendingCount,
        needsReviewCount,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      });
    } catch (err) {
      set({
        lastError: err instanceof Error ? err.message : 'Unable to load local sync status',
      });
    }
  },

  async triggerSync(shopId) {
    if (get().isSyncing || !get().isOnline) return;
    set({ isSyncing: true, lastError: null });
    try {
      const result = await runSyncCycle(shopId);
      set({
        lastError: result.error ?? null,
        lastWarnings: result.warnings,
      });
      await get().refreshStatus(shopId);
    } catch (err) {
      set({
        lastError: err instanceof Error ? err.message : 'Background sync failed',
      });
    } finally {
      set({ isSyncing: false });
    }
  },
}));
