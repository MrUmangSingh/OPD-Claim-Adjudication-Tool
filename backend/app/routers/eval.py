import json
import time
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import TEST_CASES_FILE
from ..db import get_db
from ..models import Member, Policy
from ..schemas import EvalCaseResult, EvalResult
from ..services.adjudication import adjudicate
from ..services.fraud import check_fraud

router = APIRouter(prefix="/eval", tags=["evaluation"])


@router.post("/adjudication", response_model=EvalResult)
def run_adjudication_eval(db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=500, detail="No active policy")

    with open(TEST_CASES_FILE) as f:
        data = json.load(f)

    results: list[EvalCaseResult] = []

    for tc in data["test_cases"]:
        t0 = time.perf_counter()
        inp = tc["input_data"]
        expected = tc["expected_output"]

        member_id = inp.get("member_id", "EMP001")
        member = db.query(Member).filter(Member.member_id == member_id).first()
        if not member:
            # Create ephemeral member for eval
            from datetime import date as d_
            join_raw = inp.get("member_join_date", policy.payload.get("effective_date", "2024-01-01"))
            member = type("M", (), {
                "member_id": member_id,
                "name": inp.get("member_name", "Unknown"),
                "join_date": d_.fromisoformat(join_raw),
            })()

        tx_date = date.fromisoformat(inp["treatment_date"])
        join_raw = inp.get("member_join_date", None)
        if join_raw:
            member.join_date = date.fromisoformat(join_raw)

        docs = inp.get("documents", {})
        pres = docs.get("prescription")
        bill_dict = docs.get("bill", {})

        # Build bill line items from structured bill (skip non-numeric values like test_names lists)
        bill_line_items = []
        for key, amt in bill_dict.items():
            if not isinstance(amt, (int, float)):
                continue
            if key == "consultation_fee":
                bill_line_items.append({"name": "Consultation", "category": "consultation", "amount": float(amt)})
            elif key in ("medicines", "pharmacy"):
                bill_line_items.append({"name": "Medicines", "category": "pharmacy", "amount": float(amt)})
            elif "mri" in key or "scan" in key or "test" in key or "diagnostic" in key:
                bill_line_items.append({"name": key.replace("_", " ").title(), "category": "diagnostic", "amount": float(amt)})
            elif "root_canal" in key:
                bill_line_items.append({"name": "Root Canal", "category": "dental", "amount": float(amt)})
            elif "whitening" in key or "cosmetic" in key:
                bill_line_items.append({"name": "Teeth Whitening", "category": "dental", "amount": float(amt)})
            elif "therapy" in key:
                bill_line_items.append({"name": key.replace("_", " ").title(), "category": "alternative_medicine", "amount": float(amt)})
            elif "diet" in key:
                bill_line_items.append({"name": key.replace("_", " ").title(), "category": "other", "amount": float(amt)})
            else:
                bill_line_items.append({"name": key.replace("_", " ").title(), "category": "consultation", "amount": float(amt)})

        diagnosis = (pres or {}).get("diagnosis", "")
        fraud = check_fraud(
            previous_claims_same_day=inp.get("previous_claims_same_day", 0),
            claim_amount=float(inp["claim_amount"]),
        )

        result = adjudicate(
            policy=policy.payload,
            member=member,
            claim_amount=float(inp["claim_amount"]),
            treatment_date=tx_date,
            submission_date=tx_date,
            hospital=inp.get("hospital"),
            cashless_request=inp.get("cashless_request", False),
            previous_claims_same_day=inp.get("previous_claims_same_day", 0),
            prescription=pres,
            bill_line_items=bill_line_items or None,
            diagnosis=diagnosis,
            fraud_result=fraud,
            ytd_usage={},
        )

        latency = int((time.perf_counter() - t0) * 1000)
        exp_decision = expected.get("decision", "")
        exp_amount = expected.get("approved_amount")

        decision_match = result.decision == exp_decision
        amount_match = (
            exp_amount is None or
            abs(result.approved_amount - float(exp_amount)) < 50
        )

        results.append(EvalCaseResult(
            case_id=tc["case_id"],
            case_name=tc["case_name"],
            expected_decision=exp_decision,
            actual_decision=result.decision,
            expected_amount=float(exp_amount) if exp_amount is not None else None,
            actual_amount=result.approved_amount,
            expected_confidence=expected.get("confidence_score"),
            actual_confidence=result.confidence_score,
            decision_match=decision_match,
            amount_match=amount_match,
            latency_ms=latency,
            rejection_reasons=result.rejection_reasons,
            notes=result.notes,
        ))

    total = len(results)
    decision_acc = sum(1 for r in results if r.decision_match) / total if total else 0
    amount_acc = sum(1 for r in results if r.amount_match) / total if total else 0
    avg_latency = sum(r.latency_ms for r in results) / total if total else 0

    return EvalResult(
        total_cases=total,
        decision_accuracy=round(decision_acc, 3),
        amount_accuracy=round(amount_acc, 3),
        avg_latency_ms=round(avg_latency, 1),
        cases=results,
    )
