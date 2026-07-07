'use client';

/**
 * In-memory settings store. Entity branding and payroll calendar stay in the
 * browser; employees and slip history are persisted in Supabase.
 */

import { create } from 'zustand';
import type { EntityCode, EntityInfo, Settings } from '@/lib/types';

export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolix.tech',
  entities: {
    PX: {
      name: 'Portfolix Enterprise Pvt Ltd',
      legalLine: '',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PB: {
      name: 'Portfolio Builders',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PT: {
      name: 'Portfolix.tech',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PH: {
      name: 'Portfolix Hub',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
  },
};

interface HRState {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateEntity: (code: EntityCode, patch: Partial<EntityInfo>) => void;
}

export const useHRStore = create<HRState>((set) => ({
  settings: SEED_SETTINGS,
  setSettings: (settings) => set({ settings }),

  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  updateEntity: (code, patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        entities: {
          ...state.settings.entities,
          [code]: { ...state.settings.entities[code], ...patch },
        },
      },
    })),
}));
