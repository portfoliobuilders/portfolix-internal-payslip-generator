-- Open access for the stopgap HR tool (no auth yet).
-- Replace with authenticated-only policies before production use.

drop policy if exists "Allow authenticated access" on public.employees;
drop policy if exists "Allow authenticated access" on public.payroll_slips;

create policy "Allow anon full access" on public.employees
  for all to anon, public
  using (true)
  with check (true);

create policy "Allow anon full access" on public.payroll_slips
  for all to anon, public
  using (true)
  with check (true);
