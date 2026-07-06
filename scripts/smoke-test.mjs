/**
 * Headless end-to-end smoke test against the static export (out/).
 * Exercises: roster CRUD, flex adjustment, generator math on screen,
 * draft/final rendering, finalize flow, deferred chain, history.
 * Run: node scripts/smoke-test.mjs (expects the site on :8123).
 */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8123';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Employee Roster');
check('app loads without console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

// ---------- Add an employee ----------
await page.click('button:has-text("Add employee")');
await page.fill('input[placeholder="Asha Verma"]', 'Asha Verma');
await page.selectOption('select', { index: 1 }); // PB entity (second option in entity select)
// entity select is the first select in the modal
const modal = page.locator('div.fixed >> div.rounded-lg');
await modal.locator('select').first().selectOption('PB');
await page.fill('input[placeholder="PB-2024-042"]', 'PB-2024-042');
await page.fill('input[type="date"]', '2024-03-01');
await page.fill('input[placeholder="Engineering"]', 'Engineering');
await page.fill('input[placeholder="Frontend Developer"]', 'Frontend Developer');
await page.fill('textarea', 'Flat 12B, Green Residency, Noida');
await page.fill('input[placeholder="25000"]', '25000');
await page.fill('input[placeholder="4821"]', '4821');
await page.fill('input[placeholder="ABXXXXXX1F"]', 'ABXXXXXX1F');
await page.click('button:has-text("Add employee") >> nth=-1');
await page.waitForSelector('td:has-text("Asha Verma")');
check('employee added to roster', await page.locator('td:has-text("Asha Verma")').count() === 1);
check('base salary formatted en-IN', (await page.textContent('table')).includes('₹25,000.00'));

// ---------- Flex adjustment ----------
await page.click('button[title="Adjust flex bank"]');
await page.fill('input[placeholder="+60"]', '120');
await page.fill('input[placeholder*="Saturday"]', 'Worked Saturday support shift');
await page.click('button:has-text("Apply adjustment")');
await page.waitForTimeout(200);
check('flex balance shows 2h', (await page.textContent('table')).includes('2h'));

// ---------- Generator ----------
await page.click('button[title="Generate slip"]');
await page.waitForSelector('text=Slip Generator');
await page.fill('input[type="month"]', '2026-07');
const numInputs = page.locator('.no-print input[type="number"]');
// order: absent, half, late, flexEarned, fixedAllowance, otherDeductions, varEarned, varPaid, defOpening
await numInputs.nth(0).fill('2');   // absent
await numInputs.nth(1).fill('1');   // half days
await numInputs.nth(2).fill('450'); // late minutes
await numInputs.nth(3).fill('60');  // flex earned
await numInputs.nth(4).fill('3000');// fixed allowance
await numInputs.nth(5).fill('500'); // other deductions
await numInputs.nth(6).fill('6000');// variable earned
await numInputs.nth(7).fill('5000');// variable paid
await page.waitForTimeout(300);

const sheet = page.locator('#slip-print-root .slip-sheet');
const sheetText = await sheet.textContent();
// flex: 120 + 60 = 180 avail; 450 late → 270 unpaid → 0.5 LOP; lop = 2 + 0.5 + 0.5 = 3
check('rate basis line ₹25,000.00 ÷ 25 = ₹1,000.00/day', sheetText.includes('₹25,000.00 ÷ 25 = ₹1,000.00/day'));
check('LOP total 3.0 days', sheetText.includes('3.0'));
check('LOP deduction ₹3,000.00', sheetText.includes('₹3,000.00'));
check('net pay ₹29,500.00', sheetText.includes('₹29,500.00'), sheetText.slice(0, 400));
check('net pay words', sheetText.includes('Rupees Twenty Nine Thousand Five Hundred Only'));
check('draft banner exact text', sheetText.includes('INTERNAL DRAFT: Invalid for financial or official use. Pending final HR approval.'));
check('deferred closing ₹1,000.00 present', sheetText.includes('₹1,000.00'));
check('review deadline printed', sheetText.includes('Review queries by 03 Aug 2026 · 6:00 PM'));
check('credit date printed', sheetText.includes('05 Aug 2026'));
check('entity legal line', sheetText.includes('A unit of Portfolix Enterprise Pvt Ltd'));

// deferredClosing = 0 + 6000 - 5000 = 1000 > 0 → payout date required, export blocked
const exportBtn = page.locator('button:has-text("Download draft PDF")');
check('export blocked without payout date', await exportBtn.isDisabled());
check('amber payout prompt shown', (await page.locator('.no-print').allTextContents()).join(' ').includes('committed'));
await page.fill('.no-print input[type="date"]', '2026-08-05');
await page.waitForTimeout(200);
check('export unblocked after payout date', !(await exportBtn.isDisabled()));

// ---------- Finalize ----------
await page.click('button:has-text("✓ Final")');
await page.waitForTimeout(200);
const finalText = await sheet.textContent();
check('FINAL badge shown', finalText.includes('Final'));
check('final retains rate-basis line', finalText.includes('₹25,000.00 ÷ 25 = ₹1,000.00/day'));
check('final retains one-line LOP formula', finalText.includes('3.0 day(s) × ₹1,000.00/day'));
check('final drops granular flex working', !finalText.includes('Flex-bank working'));

const download1 = page.waitForEvent('download', { timeout: 30000 });
await page.click('button:has-text("Download PDF & finalize")');
const dl1 = await download1;
check('final PDF filename', dl1.suggestedFilename() === 'PX_PaySlip_2026-07_PB-2024-042.pdf', dl1.suggestedFilename());
await page.waitForTimeout(500);

// flex balance committed: max(180 - 450, 0) = 0
await page.click('button:has-text("Employee Roster")');
await page.waitForTimeout(200);
const rosterText = await page.textContent('table');
check('flex balance committed to 0m', rosterText.includes('0m'));

// ---------- Deferred chain for next month ----------
await page.click('button[title="Generate slip"]');
await page.waitForSelector('text=Slip Generator');
await page.fill('input[type="month"]', '2026-08');
await page.waitForTimeout(300);
const opening = await page.locator('.no-print input[type="number"]').nth(8).inputValue();
check('deferred opening auto-chains to 1000', opening === '1000', `got ${opening}`);
// break the chain
await page.locator('.no-print input[type="number"]').nth(8).fill('999');
await page.waitForTimeout(200);
check('ledger mismatch warning on form', (await page.locator('.no-print').allTextContents()).join(' ').includes('Ledger mismatch'));
check('ledger mismatch on slip', (await sheet.textContent()).includes('LEDGER MISMATCH'));

// ---------- Supersede confirmation ----------
await page.fill('input[type="month"]', '2026-07');
await page.waitForTimeout(300);
await page.click('button:has-text("✓ Final")');
await page.waitForTimeout(200);
// payout date needed again? closing = 1000+0-0 = ... after month change inputs reset? (inputs persist) — set payout date if visible
const dateInput = page.locator('.no-print input[type="date"]');
if (await dateInput.count()) await dateInput.fill('2026-08-05');
await page.waitForTimeout(200);
const finalizeBtn = page.locator('button:has-text("Download PDF & finalize")');
if (!(await finalizeBtn.isDisabled())) {
  await finalizeBtn.click();
  await page.waitForSelector('text=Supersede existing FINAL slip?');
  check('supersede confirmation shown', true);
  await page.click('button:has-text("Cancel")');
} else {
  check('supersede confirmation shown', false, 'finalize button unexpectedly disabled');
}

// ---------- History ----------
await page.click('button:has-text("History")');
await page.waitForTimeout(300);
const historyText = await page.textContent('table');
check('history lists final slip', historyText.includes('July 2026') && historyText.includes('Final'));
check('history shows net pay', historyText.includes('₹29,500.00'));

const download2 = page.waitForEvent('download', { timeout: 30000 });
await page.click('button[title="Re-download PDF (from stored snapshot)"]');
const dl2 = await download2;
check('history re-download filename', dl2.suggestedFilename() === 'PX_PaySlip_2026-07_PB-2024-042.pdf', dl2.suggestedFilename());

// ---------- Persistence across reload ----------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Employee Roster');
await page.waitForTimeout(300);
check('data persists after reload', (await page.textContent('body')).includes('Asha Verma'));

// ---------- No network calls beyond localhost ----------
const externalRequests = [];
page.on('request', (req) => {
  if (!req.url().startsWith(BASE)) externalRequests.push(req.url());
});
await page.reload({ waitUntil: 'networkidle' });
check('zero external network calls', externalRequests.length === 0, externalRequests.join(', '));

check('no console errors at end', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
