/**
 * Acceptance pass for Portfolix SlipGen (user-specified scenario).
 * Run: node scripts/acceptance-test.mjs
 * Expects Next.js dev server on http://localhost:3000
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.ACCEPTANCE_BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
const results = [];

function check(step, name, cond, extra = '') {
  const pass = !!cond;
  if (!pass) failures++;
  const line = `${pass ? 'PASS' : 'FAIL'}  [${step}] ${name}${extra ? ` — ${extra}` : ''}`;
  results.push(line);
  console.log(`  ${line}`);
  return pass;
}

function loadEnv() {
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

console.log('\n=== 1. Seed test employee ===');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('button:has-text("Add employee")', { timeout: 60000 });

// Clean up any prior test data via Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_KEY,
);
await supabase.from('payroll_slips').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await supabase.from('employees').delete().eq('employee_id', 'PB-TEST-001');
await page.reload({ waitUntil: 'networkidle' });

await page.click('button:has-text("Add employee")');
const modal = page.locator('div.fixed >> div.rounded-lg');
await modal.locator('input[placeholder="Asha Verma"]').fill('Test Employee');
await modal.locator('select').first().selectOption('PB');
await modal.locator('input[placeholder*="PB-"]').fill('PB-TEST-001');
await modal.locator('input[type="date"]').fill('2024-01-01');
await modal.locator('input[placeholder="Engineering"]').fill('QA');
await modal.locator('input[placeholder="Frontend Developer"]').fill('Test Role');
await modal.locator('input[placeholder="25000"]').fill('20000');
await modal.locator('input[type="number"]').last().fill('60');
await modal.locator('button:has-text("Add employee")').last().click();
await page.waitForSelector('td:has-text("Test Employee")', { timeout: 30000 });

const rosterAfterSeed = await page.textContent('table');
check('1', 'employee Test Employee on roster', rosterAfterSeed.includes('Test Employee'));
check('1', 'employee ID PB-TEST-001', rosterAfterSeed.includes('PB-TEST-001'));
check('1', 'base salary ₹20,000.00', rosterAfterSeed.includes('₹20,000.00'));
check('1', 'flex balance 60m (1h)', rosterAfterSeed.includes('1h') || rosterAfterSeed.includes('60m'));

const { data: empRows } = await supabase.from('employees').select('*').eq('employee_id', 'PB-TEST-001');
check('1', 'Supabase employees row exists', empRows?.length === 1, JSON.stringify(empRows));
check(
  '1',
  'Supabase flex_bank_balance = 60',
  empRows?.[0]?.flex_bank_balance === 60,
  String(empRows?.[0]?.flex_bank_balance),
);

console.log('\n=== 2. Money test (Generator) ===');
await page.click('button[title="Generate slip"]');
await page.waitForSelector('text=Slip Generator');
await page.fill('input[type="month"]', '2026-07');

const numInputs = page.locator('.no-print input[type="number"]');
await numInputs.nth(0).fill('1'); // absent
await numInputs.nth(1).fill('1'); // half days
await numInputs.nth(2).fill('600'); // late minutes
await numInputs.nth(3).fill('100'); // flex earned
await numInputs.nth(4).fill('0'); // fixed allowance
await numInputs.nth(5).fill('0'); // other deductions
await numInputs.nth(6).fill('5000'); // variable earned
await numInputs.nth(7).fill('2000'); // variable paid
// deferred opening stays 0
await page.waitForTimeout(400);

const sheet = page.locator('#slip-print-root .slip-sheet');
const draftText = await sheet.textContent();

check('2', 'per-day rate ₹800.00 visible', draftText.includes('₹20,000.00 ÷ 25 = ₹800.00/day'));
check('2', 'LOP total 2.0 days', draftText.includes('2.0'));
check('2', 'LOP deduction ₹1,600.00', draftText.includes('₹1,600.00'));
check('2', 'deferred closing ₹3,000.00', draftText.includes('₹3,000.00'));
check('2', 'net pay ₹20,400.00 (not ₹21,200)', draftText.includes('₹20,400.00') && !draftText.match(/₹21,200\.00/));
check('2', 'net pay words', draftText.includes('Rupees Twenty Thousand Four Hundred Only'));
check(
  '2',
  'draft banner exact text',
  draftText.includes('INTERNAL DRAFT: Invalid for financial or official use. Pending final HR approval.'),
);
check('2', 'granular flex-bank formula in draft', draftText.includes('Flex-bank working:'));
check('2', '440 unpaid late minutes in formula', draftText.includes('unpaid 7h 20m') || draftText.includes('unpaid 440'));

const exportDraftBtn = page.locator('button:has-text("Download draft PDF")');
check('2', 'draft PDF blocked without payout date', await exportDraftBtn.isDisabled());

// Draft mode still shows rate in Final toggle preview — switch to Final badge view without finalizing
await page.click('button:has-text("✓ Final")');
await page.waitForTimeout(200);
const finalPreviewText = await sheet.textContent();
check('2', 'per-day rate visible in Final preview mode', finalPreviewText.includes('₹20,000.00 ÷ 25 = ₹800.00/day'));
await page.click('button:has-text("Draft")');
await page.waitForTimeout(200);

await page.fill('.no-print input[type="date"]', '2026-08-15');
await page.waitForTimeout(200);
check('2', 'draft PDF unblocked after payout date', !(await exportDraftBtn.isDisabled()));

const draftDownload = page.waitForEvent('download', { timeout: 60000 });
await exportDraftBtn.click();
const draftDl = await draftDownload;
check('2', 'draft PDF filename', draftDl.suggestedFilename().includes('DRAFT'));

console.log('\n=== 3. Chain test — finalize then next month ===');
await page.click('button:has-text("✓ Final")');
await page.waitForTimeout(200);
const finalizeBtn = page.locator('button:has-text("Download PDF & finalize")');
const finalDownload = page.waitForEvent('download', { timeout: 60000 });
await finalizeBtn.click();
const finalDl = await finalDownload;
check('3', 'final PDF downloaded', !!finalDl.suggestedFilename());
check('3', 'final PDF filename (no DRAFT)', !finalDl.suggestedFilename().includes('DRAFT'));
await page.waitForTimeout(800);

await page.click('button:has-text("Employee Roster")');
await page.waitForTimeout(800);
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('table tbody tr')].find((tr) => tr.textContent?.includes('Test Employee'));
  return row?.textContent?.includes('0m') ?? false;
}, { timeout: 15000 });
const rosterAfterFinalize = await page.textContent('table');
check('3', 'flex balance committed to 0m after finalize', rosterAfterFinalize.includes('0m'));

// Step 3: re-select employee after returning to roster (generator opens fresh)
await page.click('button[title="Generate slip"]');
await page.waitForSelector('text=Slip Generator');
await page.selectOption('.no-print select', { index: 1 });
await page.fill('input[type="month"]', '2026-08');
await page.waitForTimeout(400);
const opening = await page.locator('.no-print input[type="number"]').nth(8).inputValue();
check('3', 'deferred opening auto-chains to 3000', opening === '3000', `got ${opening}`);

console.log('\n=== 4. Persistence test ===');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Employee Roster');
await page.waitForTimeout(500);
check('4', 'employee persists after hard refresh', (await page.textContent('body')).includes('Test Employee'));

await page.click('button:has-text("History")');
await page.waitForSelector('text=Slip History', { timeout: 10000 });
await page.waitForFunction(
  () =>
    document.body.textContent?.includes('July 2026') ||
    document.body.textContent?.includes('No slips match'),
  { timeout: 15000 },
);
const historyText = await page.locator('body').textContent();
check('4', 'final slip in history after refresh', historyText.includes('July 2026') && historyText.includes('Final'));
check('4', 'history net pay ₹20,400.00', historyText.includes('₹20,400.00'));

// Different browser context
const context2 = await browser.newContext();
const page2 = await context2.newPage();
await page2.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page2.waitForSelector('text=Employee Roster');
await page2.waitForTimeout(500);
const body2 = await page2.textContent('body');
check('4', 'employee visible in fresh browser context', body2.includes('Test Employee'));
await page2.click('button:has-text("History")');
await page2.waitForSelector('text=Slip History', { timeout: 10000 });
await page2.waitForFunction(() => document.body.textContent?.includes('₹20,400.00'), { timeout: 15000 });
check('4', 'slip visible in fresh browser context', (await page2.locator('body').textContent()).includes('₹20,400.00'));

const { data: slipRows } = await supabase
  .from('payroll_slips')
  .select('*')
  .eq('employee_id', 'PB-TEST-001');
check('4', 'Supabase payroll_slips row exists', (slipRows?.length ?? 0) >= 1, `count=${slipRows?.length}`);
check(
  '4',
  'Supabase slip status final',
  slipRows?.some((r) => r.status === 'final'),
  JSON.stringify(slipRows?.map((r) => r.status)),
);

console.log('\n=== 5. PDF test ===');
// Draft PDF from history isn't stored — re-open generator for draft PDF size check
await page.click('button:has-text("Generator")');
await page.waitForTimeout(300);
// Use history re-download for final
await page.click('button:has-text("History")');
await page.waitForTimeout(300);
const histFinalDl = page.waitForEvent('download', { timeout: 60000 });
await page.click('button[title="Re-download PDF (from stored snapshot)"]');
const histDl = await histFinalDl;
const histPath = await histDl.path();
const histBuf = readFileSync(histPath);
check('5', 'final PDF file non-empty', histBuf.length > 5000, `bytes=${histBuf.length}`);
check('5', 'final PDF starts with PDF header', histBuf.slice(0, 5).toString() === '%PDF-');

const finalSheetText = await page.locator('#slip-print-root .slip-sheet').textContent().catch(() => '');
check('5', 'FINAL badge on stored slip', historyText.includes('Final') || finalSheetText.includes('Final'));

console.log('\n=== 6. Delete dummy data ===');
await page.click('button:has-text("Employee Roster")');
await page.waitForSelector('td:has-text("Test Employee")');
await page.locator('tr', { hasText: 'Test Employee' }).locator('button[title="Delete"]').click();
await page.waitForSelector('text=Delete employee?');
await page.locator('div.fixed').getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(() => !document.body.textContent?.includes('PB-TEST-001'), { timeout: 15000 });
check('6', 'employee removed from roster', !(await page.locator('body').textContent())?.includes('PB-TEST-001'));

const { data: empAfter } = await supabase.from('employees').select('id').eq('employee_id', 'PB-TEST-001');
check('6', 'employee row deleted in Supabase', (empAfter?.length ?? 0) === 0);

// Clean up test slips left in history (employee delete sets employee_id NULL, keeps snapshots)
await supabase.from('payroll_slips').delete().eq('employee_id', 'PB-TEST-001');
await supabase.from('payroll_slips').delete().is('employee_id', null);

await context2.close();
await browser.close();

console.log('\n=== SUMMARY ===');
for (const r of results) console.log(r);
console.log(failures === 0 ? '\nALL ACCEPTANCE CHECKS PASSED' : `\n${failures} FAILURE(S)`);
if (consoleErrors.length) {
  console.log('\nConsole errors:', consoleErrors.join(' | '));
}
process.exit(failures === 0 ? 0 : 1);
