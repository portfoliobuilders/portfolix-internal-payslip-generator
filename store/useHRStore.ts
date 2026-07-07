'use client';

/**
 * In-memory settings store. Entity branding and payroll calendar stay in the
 * browser; employees and slip history are persisted in Supabase.
 */

import { create } from 'zustand';
import type { EntityCode, EntityInfo, Settings } from '@/lib/types';
import { COMPANY_ENTITIES, PAYROLL_CONTACT } from '@/lib/constants/company';

const ENTITY_BY_ID = {
  'portfolix-enterprise': COMPANY_ENTITIES[0],
  'portfolio-builders': COMPANY_ENTITIES[2],
  'portfolix-tech': COMPANY_ENTITIES[1],
  'portfolix-hub': COMPANY_ENTITIES[3],
} as const;

export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: PAYROLL_CONTACT,
  entities: {
    PX: {
      name: ENTITY_BY_ID['portfolix-enterprise'].displayName,
      legalLine: ENTITY_BY_ID['portfolix-enterprise'].legalLine,
      addressLines: ENTITY_BY_ID['portfolix-enterprise'].address.split('\n'),
      contact: PAYROLL_CONTACT,
      logoDataUrl: ENTITY_BY_ID['portfolix-enterprise'].logoPath,
    },
    PB: {
      name: ENTITY_BY_ID['portfolio-builders'].displayName,
      legalLine: ENTITY_BY_ID['portfolio-builders'].legalLine,
      addressLines: ENTITY_BY_ID['portfolio-builders'].address.split('\n'),
      contact: PAYROLL_CONTACT,
      logoDataUrl: ENTITY_BY_ID['portfolio-builders'].logoPath,
    },
    PT: {
      name: ENTITY_BY_ID['portfolix-tech'].displayName,
      legalLine: ENTITY_BY_ID['portfolix-tech'].legalLine,
      addressLines: ENTITY_BY_ID['portfolix-tech'].address.split('\n'),
      contact: PAYROLL_CONTACT,
      logoDataUrl: ENTITY_BY_ID['portfolix-tech'].logoPath,
    },
    PH: {
      name: ENTITY_BY_ID['portfolix-hub'].displayName,
      legalLine: ENTITY_BY_ID['portfolix-hub'].legalLine,
      addressLines: ENTITY_BY_ID['portfolix-hub'].address.split('\n'),
      contact: PAYROLL_CONTACT,
      logoDataUrl: ENTITY_BY_ID['portfolix-hub'].logoPath,
    },
  },
};

interface HRState {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  updateEntity: (code: EntityCode, patch: Partial<EntityInfo>) => void;
}

export const useHRStore = create<HRState>((set) => ({
  settings: SEED_SETTINGS,

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
