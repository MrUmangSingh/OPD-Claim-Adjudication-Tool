from datetime import date
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from ..models import Claim, Decision, DecisionLineItem, Member, Policy


def ytd_usage(member_id: str, treatment_date: date, db: Session) -> dict[str, float]:
    year = treatment_date.year
    rows = (
        db.query(DecisionLineItem.category, func.sum(DecisionLineItem.approved_amount))
        .join(Decision, Decision.id == DecisionLineItem.decision_id)
        .join(Claim, Claim.id == Decision.claim_id)
        .filter(
            Claim.member_id == member_id,
            extract("year", Claim.treatment_date) == year,
            Decision.decision.in_(["APPROVED", "PARTIAL"]),
        )
        .group_by(DecisionLineItem.category)
        .all()
    )
    return {cat: float(amt or 0) for cat, amt in rows}


def compute_benefits_summary(member: Member, policy: dict, db: Session) -> dict:
    today = date.today()
    usage = ytd_usage(member.member_id, today, db)

    coverage = policy.get("coverage_details", {})
    annual_limit = float(coverage.get("annual_limit", 0))
    per_claim_limit = float(coverage.get("per_claim_limit", 0))
    sub_limits = coverage.get("sub_limits", {})

    total_used = sum(usage.values())
    remaining = max(0.0, annual_limit - total_used)

    category_display = {
        "consultation": "Consultation",
        "diagnostic": "Diagnostics",
        "pharmacy": "Pharmacy",
        "dental": "Dental",
        "vision": "Vision",
        "alternative_medicine": "Alternative Medicine",
    }
    sub_limit_keys = {
        "consultation": "consultation_fees",
        "diagnostic": "diagnostic_tests",
        "pharmacy": "pharmacy",
        "dental": "dental",
        "vision": "vision",
        "alternative_medicine": "alternative_medicine",
    }

    by_category = []
    for cat, display in category_display.items():
        key = sub_limit_keys.get(cat, cat)
        cat_limit = float(sub_limits.get(key, {}).get("limit", 0)) if isinstance(sub_limits.get(key), dict) else float(sub_limits.get(key, 0))
        cat_used = usage.get(cat, 0.0)
        by_category.append({
            "category": cat,
            "label": display,
            "limit": cat_limit,
            "used": cat_used,
            "remaining": max(0.0, cat_limit - cat_used) if cat_limit > 0 else None,
        })

    network_hospitals = policy.get("network_hospitals", [])

    return {
        "annual_limit": annual_limit,
        "per_claim_limit": per_claim_limit,
        "used_ytd": total_used,
        "remaining": remaining,
        "year": today.year,
        "by_category": by_category,
        "network_hospitals": network_hospitals,
        "covered_tests": coverage.get("covered_tests", []),
    }
