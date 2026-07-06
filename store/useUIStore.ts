'use client';

/** Ephemeral (non-persisted) UI state shared across views. */

import { create } from 'zustand';

interface UIState {
  /** Employee preselected for the Generator (set from the Roster). */
  generatorEmployeeId: string | null;
  setGeneratorEmployeeId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  generatorEmployeeId: null,
  setGeneratorEmployeeId: (id) => set({ generatorEmployeeId: id }),
}));
