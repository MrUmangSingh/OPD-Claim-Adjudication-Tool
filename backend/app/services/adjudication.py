"""
5-step adjudication pipeline mirroring adjudication_rules.md.

Key spec-interpretation decisions (cite test case for each):
  - TC001: copay base = 10% of full eligible total when any consultation present
  - TC002 vs TC003: effective_cap = sub_limit if category has sub_limit, else per_claim_limit
  - TC006: doctor reg accepts multi-segment AYUR/KL/... format
  - TC007: pre-auth required = "(with pre-auth)" suffix in covered_tests (no ₹ threshold)
  - TC008: fraud flags → MANUAL_REVIEW; exception: severe name mismatch (similarity < 0.3) → auto-REJECT
  - TC010: network hospital → 20% flat discount on eligible total, copay suppressed
"""

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Optional

from .confidence import compute_confidence
from .fraud import FraudResult


DOCTOR_REG_PATTERN = re.compile(r"^[A-Z]+(/[A-Z]+)?/\d+/\d{4}$")

# Maps diagnosis keywords → specific_ailment waiting period keys from policy
DIAGNOSIS_AILMENT_MAP: dict[str, str] = {
    "diabetes": "diabetes",
    "type 2 diabetes": "diabetes",
    "type 1 diabetes": "diabetes",
    "hypertension": "hypertension",
    "high blood pressure": "hypertension",
    "joint replacement": "joint_replacement",
    "knee replacement": "joint_replacement",
    "hip replacement": "joint_replacement",
}

CATEGORY_SUB_LIMIT_MAP = {
    "consultation": "consultation_fees",
    "diagnostic": "diagnostic_tests",
    "pharmacy": "pharmacy",
    "dental": "dental",
    "vision": "vision",
    "alternative_medicine": "alternative_medicine",
}


@dataclass
class StepResult:
    step: int
    name: str
    passed: bool
    reasons: list[str] = field(default_factory=list)
    modifiers: dict[str, Any] = field(default_factory=dict)
    notes: str = ""


@dataclass
class LineItem:
    name: str
    category: str
    claimed_amount: float
    approved_amount: float = 0.0
    status: str = "approved"
    reason: Optional[str] = None


@dataclass
class AdjudicationResult:
    decision: str  # APPROVED | REJECTED | PARTIAL | MANUAL_REVIEW
    approved_amount: float
    total_copay: float
    total_discount: float
    rejection_reasons: list[str]
    flags: list[str]
    confidence_score: float
    notes: str
    next_steps: str
    reasoning_steps: list[dict]
    line_items: list[LineItem]


def _parse_covered_tests(policy: dict) -> dict[str, bool]:
    """Return {test_name_lower: requires_pre_auth}."""
    tests = policy.get("coverage_details", {}).get("diagnostic_tests", {}).get("covered_tests", [])
    result = {}
    for t in tests:
        requires = "(with pre-auth)" in t.lower()
        clean = t.lower().replace("(with pre-auth)", "").strip()
        result[clean] = requires
    return result


def adjudicate(
    policy: dict,
    member: Any,
    claim_amount: float,
    treatment_date: date,
    submission_date: date,
    hospital: Optional[str],
    cashless_request: bool,
    previous_claims_same_day: int,
    # Extracted or structured doc data
    prescription: Optional[dict] = None,
    bill_line_items: Optional[list[dict]] = None,
    diagnosis: Optional[str] = None,
    pre_auth_number: Optional[str] = None,
    extraction_confidence: float = 1.0,
    medical_necessity_result: Optional[dict] = None,
    fraud_result: Optional[FraudResult] = None,
    # YTD usage per category {category: amount_used}
    ytd_usage: Optional[dict[str, float]] = None,
) -> AdjudicationResult:
    steps: list[StepResult] = []
    all_reasons: list[str] = []
    ytd_usage = ytd_usage or {}
    covered_tests = _parse_covered_tests(policy)
    coverage = policy.get("coverage_details", {})
    waiting = policy.get("waiting_periods", {})
    exclusions = [e.lower() for e in policy.get("exclusions", [])]
    network_hospitals = [h.lower() for h in policy.get("network_hospitals", [])]
    annual_limit = coverage.get("annual_limit", 50000)
    per_claim_limit = coverage.get("per_claim_limit", 5000)
    min_claim = policy.get("claim_requirements", {}).get("minimum_claim_amount", 500)
    sub_deadline = policy.get("claim_requirements", {}).get("submission_timeline_days", 30)

    # ── Step 1: Eligibility ───────────────────────────────────────────────────
    s1_reasons = []

    policy_effective = date.fromisoformat(policy.get("effective_date", "2024-01-01"))
    if treatment_date < policy_effective:
        s1_reasons.append("POLICY_INACTIVE")

    join_date = member.join_date if hasattr(member, "join_date") else policy_effective
    days_since_join = (treatment_date - join_date).days
    initial_wait = waiting.get("initial_waiting", 30)
    if days_since_join < initial_wait:
        s1_reasons.append("WAITING_PERIOD")

    diagnosis_lower = (diagnosis or "").lower()
    specific_waits = waiting.get("specific_ailments", {})
    for keyword, ailment_key in DIAGNOSIS_AILMENT_MAP.items():
        if keyword in diagnosis_lower and ailment_key in specific_waits:
            required_days = specific_waits[ailment_key]
            if days_since_join < required_days:
                eligible_date = join_date + timedelta(days=required_days)
                s1_reasons.append("WAITING_PERIOD")
                notes_suffix = f" Eligible from {eligible_date.isoformat()}"
                break

    if claim_amount < min_claim:
        s1_reasons.append("BELOW_MIN_AMOUNT")

    sub_days = (submission_date - treatment_date).days
    if sub_days > sub_deadline:
        s1_reasons.append("LATE_SUBMISSION")

    s1 = StepResult(1, "Eligibility Check", passed=not s1_reasons, reasons=s1_reasons)
    steps.append(s1)
    all_reasons.extend(s1_reasons)

    # ── Step 2: Document Validation ───────────────────────────────────────────
    s2_reasons = []

    if not prescription:
        s2_reasons.append("MISSING_DOCUMENTS")
    else:
        reg = prescription.get("doctor_reg", "")
        if reg and not DOCTOR_REG_PATTERN.match(reg.upper()):
            s2_reasons.append("DOCTOR_REG_INVALID")

    s2 = StepResult(2, "Document Validation", passed=not s2_reasons, reasons=s2_reasons)
    steps.append(s2)
    all_reasons.extend(s2_reasons)

    # ── Step 3: Coverage Verification ─────────────────────────────────────────
    s3_reasons = []
    pre_auth_items = []

    for exc in exclusions:
        if exc in diagnosis_lower:
            s3_reasons.append("EXCLUDED_CONDITION")
            break

    # Check if diagnosis keywords match excluded treatments
    excluded_keywords = [
        ("weight loss", "SERVICE_NOT_COVERED"),
        ("cosmetic", "SERVICE_NOT_COVERED"),
        ("bariatric", "SERVICE_NOT_COVERED"),
        ("infertility", "SERVICE_NOT_COVERED"),
        ("experimental", "EXPERIMENTAL_TREATMENT"),
        ("lasik", "SERVICE_NOT_COVERED"),
    ]
    for kw, code in excluded_keywords:
        if kw in diagnosis_lower:
            if code not in s3_reasons:
                s3_reasons.append(code)

    for test_lower, req_auth in covered_tests.items():
        if req_auth:
            test_mentions = [
                (prescription or {}).get("tests_advised", []),
                [li.get("name", "") for li in (bill_line_items or []) if li.get("category") == "diagnostic"],
            ]
            for mention_list in test_mentions:
                for item in mention_list:
                    if test_lower in item.lower():
                        if not pre_auth_number:
                            pre_auth_items.append(item)

    if pre_auth_items:
        s3_reasons.append("PRE_AUTH_MISSING")

    s3 = StepResult(
        3, "Coverage Verification", passed=not s3_reasons, reasons=s3_reasons,
        notes=f"Pre-auth required for: {', '.join(pre_auth_items)}" if pre_auth_items else "",
    )
    steps.append(s3)
    all_reasons.extend(s3_reasons)

    # ── Step 4: Limits & Line Items ────────────────────────────────────────────
    s4_reasons = []
    line_items: list[LineItem] = []

    if bill_line_items:
        for item in bill_line_items:
            cat = item.get("category", "other")
            amt = float(item.get("amount", 0))
            name = item.get("name", "")
            item_lower = name.lower()

            # Per-item exclusion: cosmetic procedures
            if "whitening" in item_lower or "cosmetic" in item_lower or "lasik" in item_lower or "bariatric" in item_lower:
                line_items.append(LineItem(name, cat, amt, 0.0, "rejected", "COSMETIC_PROCEDURE"))
                continue

            # Sub-limit check (TC002 vs TC003 rule)
            cat_key = CATEGORY_SUB_LIMIT_MAP.get(cat)
            if cat_key and cat_key in coverage:
                sub_limit = coverage[cat_key].get("sub_limit", per_claim_limit)
            else:
                sub_limit = per_claim_limit

            # Zero-amount items (e.g. "included in package") are complimentary — skip limit check
            if amt <= 0:
                line_items.append(LineItem(name, cat, 0.0, 0.0, "approved"))
                continue

            ytd_cat = ytd_usage.get(cat, 0)
            remaining = max(0.0, sub_limit - ytd_cat)
            approved = min(amt, remaining)

            if approved <= 0:
                line_items.append(LineItem(name, cat, amt, 0.0, "rejected", "SUB_LIMIT_EXCEEDED"))
                s4_reasons.append("SUB_LIMIT_EXCEEDED")
            else:
                line_items.append(LineItem(name, cat, amt, approved, "approved"))
    else:
        # No line items — treat whole claim as single item
        cat = _infer_category(diagnosis or "")
        cat_key = CATEGORY_SUB_LIMIT_MAP.get(cat)
        if cat_key and cat_key in coverage:
            sub_limit = coverage[cat_key].get("sub_limit", per_claim_limit)
        else:
            sub_limit = per_claim_limit

        effective_cap = sub_limit
        if claim_amount > effective_cap:
            s4_reasons.append("PER_CLAIM_EXCEEDED" if effective_cap == per_claim_limit else "SUB_LIMIT_EXCEEDED")
            line_items.append(LineItem("Claim total", cat, claim_amount, 0.0, "rejected",
                                       f"Exceeds limit of ₹{effective_cap:,.0f}"))
        else:
            line_items.append(LineItem("Claim total", cat, claim_amount, claim_amount, "approved"))

    eligible_total = sum(li.approved_amount for li in line_items if li.status == "approved")

    # Annual limit
    ytd_total = sum(ytd_usage.values())
    if ytd_total + eligible_total > annual_limit:
        eligible_total = max(0.0, annual_limit - ytd_total)
        if eligible_total == 0:
            s4_reasons.append("ANNUAL_LIMIT_EXCEEDED")

    # Per-claim limit as total cap for non-specialty claims.
    # Specialty categories (dental/vision/alternative_medicine) have their own
    # sub_limits that override per_claim_limit — TC002 root canal 8000 approved
    # despite per_claim_limit=5000, because dental sub_limit=10000.
    # TC003 (consultation+pharmacy) has no specialty override → total 7500 > 5000 → REJECTED.
    SPECIALTY_CATS = {"dental", "vision", "alternative_medicine"}
    approved_categories = {li.category for li in line_items if li.status == "approved"}
    has_specialty = bool(approved_categories & SPECIALTY_CATS)

    # Only apply per_claim_limit cap if no prior hard rejections (s1-s3) and no specialty
    prior_hard = bool(s1_reasons or s2_reasons or s3_reasons)
    if not has_specialty and eligible_total > per_claim_limit and not s4_reasons and not prior_hard:
        s4_reasons.append("PER_CLAIM_EXCEEDED")
        eligible_total = per_claim_limit  # cap rather than zero for potential partial

    s4 = StepResult(4, "Limit Validation", passed=not s4_reasons, reasons=s4_reasons,
                    modifiers={"eligible_total": eligible_total})
    steps.append(s4)
    all_reasons.extend(s4_reasons)

    # ── Step 5: Medical Necessity ──────────────────────────────────────────────
    s5_reasons = []
    medical_confidence = 1.0

    if medical_necessity_result:
        medical_confidence = medical_necessity_result.get("confidence", 1.0)
        if not medical_necessity_result.get("appropriate", True):
            s5_reasons.append("NOT_MEDICALLY_NECESSARY")

    s5 = StepResult(5, "Medical Necessity", passed=not s5_reasons, reasons=s5_reasons,
                    notes=medical_necessity_result.get("reasoning", "") if medical_necessity_result else "")
    steps.append(s5)
    all_reasons.extend(s5_reasons)

    # ── Fraud check ────────────────────────────────────────────────────────────
    flags = fraud_result.flags if fraud_result else []
    is_fraud_flagged = fraud_result.flagged if fraud_result else False

    # ── Network / copay logic (TC001 vs TC010) ────────────────────────────────
    is_network = hospital and hospital.lower() in network_hospitals
    copay = 0.0
    discount = 0.0

    if eligible_total > 0:
        if is_network:
            # TC010: 20% flat discount on eligible total; no copay
            network_discount_pct = coverage.get("consultation_fees", {}).get("network_discount", 0) / 100
            discount = round(eligible_total * network_discount_pct, 2)
            eligible_total = round(eligible_total - discount, 2)
        else:
            # TC001: 10% copay applies only when a consultation LINE ITEM is present
            # AND no specialty category items exist.
            # TC002 (dental + consultation → dental specialty → no copay).
            # TC006 (alternative_medicine + consultation → specialty → no copay → 4000).
            has_consultation_item = any(
                li.category == "consultation" and li.status == "approved"
                for li in line_items
            ) or (not bill_line_items and prescription and _infer_category(diagnosis or "") == "consultation")
            if has_consultation_item and not has_specialty:
                copay_pct = coverage.get("consultation_fees", {}).get("copay_percentage", 0) / 100
                copay = round(eligible_total * copay_pct, 2)
                eligible_total = round(eligible_total - copay, 2)

    # ── Compose final decision ────────────────────────────────────────────────
    hard_rejections = [r for r in all_reasons if r not in ("SUB_LIMIT_EXCEEDED", "PER_CLAIM_EXCEEDED") or not has_specialty]
    has_partial = any(li.status == "rejected" for li in line_items) and any(li.status == "approved" for li in line_items)
    all_rejected = all(li.status == "rejected" for li in line_items) if line_items else False

    if fraud_result and fraud_result.hard_reject:
        # Severe name mismatch (names share no resemblance) → clearly a different person's document
        final_decision = "REJECTED"
        eligible_total = 0.0
    elif is_fraud_flagged:
        # TC008: other fraud indicators → MANUAL_REVIEW (never auto-reject)
        final_decision = "MANUAL_REVIEW"
    elif hard_rejections:
        final_decision = "REJECTED"
        eligible_total = 0.0
    elif all_rejected:
        final_decision = "REJECTED"
        eligible_total = 0.0
    elif has_partial:
        final_decision = "PARTIAL"
    else:
        final_decision = "APPROVED"

    # Confidence
    # Name mismatch hard-reject is a certain finding — don't penalize confidence for it.
    # Only uncertain fraud signals (high value, same-day, low extraction) reduce confidence.
    uncertain_fraud_flags = [
        f for f in flags if "Patient name mismatch" not in f
    ] if (fraud_result and fraud_result.hard_reject) else flags
    borderline = sum(1 for r in steps if not r.passed and len(r.reasons) == 1)
    low_conf_fields = 1 if extraction_confidence < 0.7 else 0
    score = compute_confidence(
        fraud_flag_count=len(uncertain_fraud_flags),
        extraction_field_low_confidence_count=low_conf_fields,
        medical_necessity_confidence=medical_confidence,
        borderline_rule_count=borderline,
    )

    # Force MANUAL_REVIEW if confidence < 0.70
    if score < 0.70 and final_decision not in ("REJECTED",):
        final_decision = "MANUAL_REVIEW"

    # Notes and next_steps
    rejection_reasons = list(dict.fromkeys(all_reasons))  # dedupe, preserve order
    notes = _build_notes(rejection_reasons, flags, diagnosis, eligible_total)
    next_steps = _build_next_steps(final_decision, rejection_reasons)

    return AdjudicationResult(
        decision=final_decision,
        approved_amount=round(eligible_total, 2),
        total_copay=copay,
        total_discount=discount,
        rejection_reasons=rejection_reasons,
        flags=flags,
        confidence_score=score,
        notes=notes,
        next_steps=next_steps,
        reasoning_steps=[
            {
                "step": s.step, "name": s.name, "passed": s.passed,
                "reasons": s.reasons, "notes": s.notes,
            }
            for s in steps
        ],
        line_items=line_items,
    )


def _infer_category(diagnosis: str) -> str:
    d = diagnosis.lower()
    if any(k in d for k in ["tooth", "dental", "root canal", "cavity", "gum"]):
        return "dental"
    if any(k in d for k in ["eye", "vision", "cataract", "glaucoma", "spectacle"]):
        return "vision"
    if any(k in d for k in ["ayurveda", "homeopathy", "panchakarma", "unani", "joint pain"]):
        return "alternative_medicine"
    return "consultation"


def _build_notes(reasons: list[str], flags: list[str], diagnosis: Optional[str], amount: float) -> str:
    parts = []
    for r in reasons:
        if r == "WAITING_PERIOD":
            parts.append(f"Treatment during waiting period for '{diagnosis}'.")
        elif r == "PER_CLAIM_EXCEEDED":
            parts.append("Claim amount exceeds per-claim limit of ₹5,000.")
        elif r == "SUB_LIMIT_EXCEEDED":
            parts.append("Category sub-limit has been exhausted.")
        elif r == "ANNUAL_LIMIT_EXCEEDED":
            parts.append("Annual limit exhausted.")
        elif r == "MISSING_DOCUMENTS":
            parts.append("Prescription from registered doctor is required.")
        elif r == "PRE_AUTH_MISSING":
            parts.append("Pre-authorization required for this diagnostic test.")
        elif r == "SERVICE_NOT_COVERED":
            parts.append("Treatment/service not covered under this policy.")
        elif r == "EXCLUDED_CONDITION":
            parts.append("Condition is in the policy exclusions list.")
        elif r == "COSMETIC_PROCEDURE":
            parts.append("Cosmetic procedures are excluded from coverage.")
    if flags:
        name_mismatch = next((f for f in flags if "Patient name mismatch" in f), None)
        other_flags = [f for f in flags if f is not name_mismatch]
        if name_mismatch:
            parts.append(f"Rejected: {name_mismatch}. Document does not belong to the insured member.")
        if other_flags:
            parts.append("Fraud indicators: " + "; ".join(other_flags))
    return " ".join(parts) if parts else f"Approved amount: ₹{amount:,.2f}"


def _build_next_steps(decision: str, reasons: list[str]) -> str:
    if decision == "APPROVED":
        return "Reimbursement will be processed within 5-7 working days."
    elif decision == "PARTIAL":
        return "Partial reimbursement will be processed. Review rejected line items for details."
    elif decision == "MANUAL_REVIEW":
        return "Claim has been flagged for manual review. A claims officer will contact you within 2 working days."
    elif "WAITING_PERIOD" in reasons:
        return "Please re-submit the claim once the waiting period is complete."
    elif "MISSING_DOCUMENTS" in reasons:
        return "Please re-submit with all required documents including a valid prescription."
    elif "PRE_AUTH_MISSING" in reasons:
        return "Contact the insurer to obtain pre-authorization before this procedure."
    else:
        return "Please contact the claims helpline for assistance."
