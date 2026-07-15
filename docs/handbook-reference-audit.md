# Handbook Reference Audit (Old Draft - Reference Only)

> **WARNING:** This handbook is an old draft reference. It is not the current approved policy source. Do not implement or enforce any handbook clause in the application without founder approval and legal/HR review where required.
>
> **Scope guard for this audit:** Reference-only extraction from the old handbook for planning. No current app behavior, payroll logic, status model, route structure, settings persistence, Supabase schema, or policy enforcement is changed by this document.

## Purpose

This document captures potentially useful policy areas from the old "Portfolix Entreprise Employee Handbook v2.0" strictly as implementation backlog input. It is **not** an approval to enforce these clauses in-product.

---

## 1) Workforce categories

- Full-time, part-time, contractors/consultants, interns/apprentices, remote personnel  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Use as reference for future fields:** `workforce_category`, `employment_type`.

- "At-will"/termination framing and broad legal positioning language  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 2) Onboarding and appointment

- Distinct stages: offer acceptance, appointment issuance, onboarding completion, first working day attended  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `offer_letter_status`, `appointment_letter_status`, `onboarding_completed`, `first_day_attended`.

- Rule that employment/salary starts only after appointment + onboarding completion  
  **Classification:** NEEDS FOUNDER APPROVAL

- Probation duration, extension, and confirmation thresholds  
  **Classification:** NEEDS FOUNDER APPROVAL

---

## 3) Document verification

- Required verification artifacts (ID, education, address, prior employment, bank details, authorization forms)  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `document_verification_status`, `background_verification_status`, `verification_notes`.

- Police verification language for sensitive roles and hard punitive outcomes for discrepancies  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 4) Compensation and payment rules

- Structured compensation components (basic, allowances, variable/incentive, statutory deductions)  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `compensation_plan_type`, `incentive_plan_assigned`.

- Attendance-linked eligibility thresholds, target-linked salary withholding, probation-linked payout changes  
  **Classification:** NEEDS FOUNDER APPROVAL

- Penalty/recovery deductions, withholding, forfeiture, management-final wording  
  **Classification:** NEEDS LEGAL/HR REVIEW

- Any automatic penalty, withholding, deduction, or payroll suppression behavior  
  **Classification:** DO NOT IMPLEMENT YET

---

## 5) Stipend/payment statement considerations

- Payment metadata useful for payslip/payout statements (payout mode, payout date, dispute window, itemized deductions visibility)  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `payment_mode`, `payment_cycle_date`, `dispute_window_days`.

- Early-exit compensation, clawbacks, training recovery, settlement offsets  
  **Classification:** NEEDS LEGAL/HR REVIEW

- Any statement logic that changes net payout or auto-recovers costs  
  **Classification:** DO NOT IMPLEMENT YET

---

## 6) Attendance and leave

- Trackable objects: attendance state, leave request status, leave type, approval timestamps  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `attendance_status`, `leave_request_status`, `leave_type`, `approved_by`.

- Working hour definitions, lateness penalties, minimum attendance gates, leave accrual/encashment specifics  
  **Classification:** NEEDS FOUNDER APPROVAL

- Deduction/disciplinary consequences tied to attendance non-compliance  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 7) WFH/remote work

- WFH request and approval lifecycle fields  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `wfh_request_status`, `wfh_approved_days`, `remote_policy_acknowledged`.

- Limits/frequency restrictions and eligibility conditions (e.g., confirmation status, performance thresholds)  
  **Classification:** NEEDS FOUNDER APPROVAL

- Monitoring/surveillance-heavy wording and punitive responses  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 8) Conduct and professional standards

- General code-of-conduct categories useful for policy cataloging (integrity, professionalism, accountability, respect)  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `conduct_policy_acknowledged`, `conduct_training_completed`.

- Specific disciplinary thresholds and direct termination mappings  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 9) Confidentiality and IP

- Acknowledgment tracking for confidentiality/IP obligations  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `nda_signed`, `ip_assignment_signed`, `confidentiality_policy_accepted`.

- Non-compete scope, duration, geography, assignment enforceability language  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 10) Data security

- Security policy acceptance/training state fields  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `data_security_policy_accepted`, `access_policy_accepted`, `security_training_completed`.

- Prescriptive technical controls as policy mandates (password cycles, 2FA mandates, device controls)  
  **Classification:** NEEDS FOUNDER APPROVAL

- Liability/recovery and criminal-proceeding language connected to breaches  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 11) Moonlighting and conflict of interest

- Signed declaration/acceptance tracking  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `moonlighting_policy_accepted`, `conflict_disclosure_status`.

- Absolute prohibition language, strict consequences, negative reference commitments  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 12) Performance and probation

- Process metadata (review cycle state, PIP status, probation state)  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `performance_cycle_status`, `pip_status`, `probation_status`.

- Threshold-driven compensation, promotion eligibility hard gates, automatic extension/termination triggers  
  **Classification:** NEEDS FOUNDER APPROVAL

- Termination-without-notice pathways tied to scoring patterns  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 13) Grievance and disciplinary process

- Grievance workflow states and timestamps  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `grievance_status`, `grievance_submitted_at`, `grievance_resolved_at`.

- Progressive discipline sequencing and penalties  
  **Classification:** NEEDS FOUNDER APPROVAL

- Summary dismissal rules and legal enforcement language  
  **Classification:** NEEDS LEGAL/HR REVIEW

---

## 14) Exit, resignation, settlement

- Offboarding checklist and document completion tracking  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `offboarding_status`, `asset_return_status`, `exit_interview_completed`.

- Notice period configuration, settlement timelines, leave encashment handling  
  **Classification:** NEEDS FOUNDER APPROVAL

- Settlement deductions, forfeiture, recoveries, legal/negative reference outcomes  
  **Classification:** NEEDS LEGAL/HR REVIEW

- Any automatic settlement deduction/withholding or irreversible workforce record deletion  
  **Classification:** DO NOT IMPLEMENT YET

---

## 15) Policy acknowledgment

- Versioned acknowledgment model for handbook and policy modules  
  **Classification:** SAFE TO USE AS SYSTEM FIELD  
  **Future field candidates:** `policy_acknowledged`, `policy_version`, `handbook_version`, `acknowledgment_date`.

- Auto-enforcement of policy clauses when signed acknowledgment is absent  
  **Classification:** DO NOT IMPLEMENT YET

---

## Proposed Backlog for Future Approval (Reference-Only)

### A) Safe system fields to add later (propose only; no migrations yet)

- `policy_acknowledged`
- `policy_version`
- `handbook_version`
- `acknowledgment_date`
- `onboarding_completed`
- `document_verification_status`
- `background_verification_status`
- `appointment_letter_status`
- `offer_letter_status`
- `nda_signed`
- `ip_assignment_signed`
- `access_policy_accepted`
- `ai_tool_policy_accepted`
- `moonlighting_policy_accepted`
- `confidentiality_policy_accepted`
- `data_security_policy_accepted`

### B) Needs founder approval

- working hours
- leave rules
- WFH limits
- minimum attendance rules
- salary/stipend eligibility rules
- performance-linked payment rules
- notice period rules
- probation extension rules
- offboarding workflow
- final settlement timeline

### C) Needs legal/HR review

- penalty deductions
- salary withholding
- recovery of losses
- moonlighting consequences
- non-compete wording
- termination without notice wording
- negative reference wording
- police complaint wording
- confidentiality breach recovery
- training cost recovery
- forfeiture of dues
- dispute jurisdiction/arbitration wording

### D) Do not implement yet

- automatic penalty deduction
- automatic salary withholding
- automatic termination decision
- hidden legal safeguards
- negative reference automation
- police complaint automation
- irreversible hard delete of workforce records
- policy enforcement without signed acknowledgment

---

## Explicit Non-Change Guardrails (captured from owner instruction)

- Do **not** modify Employee Roster logic.
- Do **not** modify Generator logic.
- Do **not** modify History logic.
- Do **not** modify Settings persistence.
- Do **not** modify existing Supabase schema.
- Do **not** modify existing payment statement generation.
- Do **not** modify existing route structure.
- Do **not** rename existing fields.
- Do **not** change salary/stipend calculations.
- Do **not** change employee statuses.
- Do **not** alter policy violation logic.
- Do **not** add hidden penalty/deduction/termination automation.

This file is a planning artifact only.
