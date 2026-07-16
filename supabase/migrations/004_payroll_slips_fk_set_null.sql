-- Keep slip history when an employee is removed from the roster.
alter table public.payroll_slips drop constraint if exists payroll_slips_employee_id_fkey;

alter table public.payroll_slips
  add constraint payroll_slips_employee_id_fkey
  foreign key (employee_id) references public.employees(employee_id)
  on delete set null;
