import type { Settings } from '@/lib/types';

/** Default payroll settings and entity branding used on first run. */
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
