import hashlib
import shutil
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, extract
from sqlalchemy.orm import Session, selectinload

from ..config import UPLOAD_DIR
from ..db import get_db
from ..models import Claim, Decision, DecisionLineItem, Document, ExtractedFields, Member, Policy, ReviewAction
from ..schemas import ClaimResponse, DecisionResponse, ReviewActionCreate, ReviewActionResponse
from ..services.adjudication import adjudicate, LineItem
from ..services.extraction import assess_medical_necessity, extract_documents
from ..services.fraud import check_fraud

router = APIRouter(prefix="/claims", tags=["claims"])


def _claim_ref() -> str:
    return "CLM-" + uuid.uuid4().hex[:8].upper()


def _get_policy(db: Session) -> dict:
    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=500, detail="No active policy configured")
    return policy.payload


def _get_member(member_id: str, db: Session) -> Member:
    member = db.query(Member).filter(Member.member_id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail=f"Member '{member_id}' not found")
    return member


def _ytd_usage(member_id: str, treatment_date: date, db: Session) -> dict[str, float]:
    year = treatment_date.year
    rows = (
        db.query(DecisionLineItem.category, func.sum(DecisionLineItem.approved_amount))
        .join(Decision, Decision.id == DecisionLineItem.decision_id)
        .join(Claim, Claim.id == Decision.claim_id)
        .filter(
            Claim.member_id == member_id,
            extract("year", Claim.treatment_date) == year,
            Decision.decision.in_(["APPROVED", "PARTIAL", "DECIDED_BY_HUMAN"]),
        )
        .group_by(DecisionLineItem.category)
        .all()
    )
    return {cat: float(amt or 0) for cat, amt in rows}


async def _process_claim(claim_id: int, db_factory) -> None:
    """Background task: extract docs, run adjudication, persist decision."""
    db: Session = db_factory()
    try:
        claim = (
            db.query(Claim)
            .options(selectinload(Claim.documents), selectinload(Claim.member))
            .filter(Claim.id == claim_id)
            .first()
        )
        if not claim:
            return

        policy = db.query(Policy).filter(Policy.active == True).first()
        policy_data = policy.payload

        # Extract documents
        doc_paths = [(doc.doc_type, Path(doc.file_path)) for doc in claim.documents]
        extracted = {}
        extraction_confidence = 1.0

        if doc_paths and policy_data.get("coverage_details"):
            try:
                extracted = await extract_documents(doc_paths)
                confidences = [v.get("extraction_confidence", 1.0) for v in extracted.values() if v]
                extraction_confidence = min(confidences) if confidences else 1.0
            except Exception as e:
                extraction_confidence = 0.6

        # Persist extracted fields
        for doc_type, payload in extracted.items():
            db.add(ExtractedFields(
                claim_id=claim.id,
                doc_type=doc_type,
                payload=payload,
                extraction_confidence=payload.get("extraction_confidence", 1.0),
            ))
        db.flush()

        # Collate extraction results
        pres = extracted.get("prescription", {})
        bill = extracted.get("bill", {})
        pharmacy = extracted.get("pharmacy_bill", {})

        diagnosis = pres.get("diagnosis", "")
        medicines = pres.get("medicines_prescribed", [])
        tests_advised = pres.get("tests_advised", [])
        bill_line_items = bill.get("line_items", [])

        # Medical necessity (Claude call)
        medical_necessity = None
        if diagnosis and (medicines or tests_advised):
            try:
                medical_necessity = await assess_medical_necessity(diagnosis, medicines, tests_advised)
            except Exception:
                medical_necessity = {"appropriate": True, "confidence": 0.8, "reasoning": "Assessment unavailable"}

        # Fraud
        fraud_result = check_fraud(
            previous_claims_same_day=claim.previous_claims_same_day,
            claim_amount=claim.claim_amount,
            extraction_confidence=extraction_confidence,
            document_patient_name=pres.get("patient_name", "") or bill.get("patient_name", ""),
            member_name=claim.member.name if claim.member else "",
        )

        ytd = _ytd_usage(claim.member_id, claim.treatment_date, db)

        result = adjudicate(
            policy=policy_data,
            member=claim.member,
            claim_amount=claim.claim_amount,
            treatment_date=claim.treatment_date,
            submission_date=claim.submission_date,
            hospital=claim.hospital,
            cashless_request=claim.cashless_request,
            previous_claims_same_day=claim.previous_claims_same_day,
            prescription=pres if pres else None,
            bill_line_items=bill_line_items or None,
            diagnosis=diagnosis,
            pre_auth_number=None,
            extraction_confidence=extraction_confidence,
            medical_necessity_result=medical_necessity,
            fraud_result=fraud_result,
            ytd_usage=ytd,
        )

        decision = Decision(
            claim_id=claim.id,
            decision=result.decision,
            approved_amount=result.approved_amount,
            total_copay=result.total_copay,
            total_discount=result.total_discount,
            rejection_reasons=result.rejection_reasons,
            flags=result.flags,
            confidence_score=result.confidence_score,
            notes=result.notes,
            next_steps=result.next_steps,
            reasoning_steps=result.reasoning_steps,
        )
        db.add(decision)
        db.flush()

        for li in result.line_items:
            db.add(DecisionLineItem(
                decision_id=decision.id,
                name=li.name,
                category=li.category,
                claimed_amount=li.claimed_amount,
                approved_amount=li.approved_amount,
                status=li.status,
                reason=li.reason,
            ))

        claim.status = "manual_review" if result.decision == "MANUAL_REVIEW" else "decided"
        db.commit()

    except Exception as e:
        try:
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim:
                claim.status = "error"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("", response_model=ClaimResponse, status_code=202)
async def submit_claim(
    background_tasks: BackgroundTasks,
    member_id: str = Form(...),
    treatment_date: date = Form(...),
    claim_amount: float = Form(...),
    hospital: Optional[str] = Form(None),
    cashless_request: bool = Form(False),
    previous_claims_same_day: int = Form(0),
    files: list[UploadFile] = File(default=[]),
    doc_types: list[str] = Form(default=[]),
    db: Session = Depends(get_db),
):
    member = _get_member(member_id, db)
    _get_policy(db)

    claim = Claim(
        claim_ref=_claim_ref(),
        member_id=member_id,
        hospital=hospital,
        treatment_date=treatment_date,
        submission_date=date.today(),
        claim_amount=claim_amount,
        status="processing",
        cashless_request=cashless_request,
        previous_claims_same_day=previous_claims_same_day,
    )
    db.add(claim)
    db.flush()

    for idx, upload_file in enumerate(files):
        doc_type = doc_types[idx] if idx < len(doc_types) else "bill"
        file_ext = Path(upload_file.filename or "doc.pdf").suffix.lower()
        saved_name = f"{claim.claim_ref}_{doc_type}_{idx}{file_ext}"
        saved_path = UPLOAD_DIR / saved_name

        content = await upload_file.read()
        file_hash = hashlib.sha256(content).hexdigest()
        with open(saved_path, "wb") as f:
            f.write(content)

        db.add(Document(
            claim_id=claim.id,
            doc_type=doc_type,
            file_path=str(saved_path),
            file_name=upload_file.filename or saved_name,
            file_hash=file_hash,
        ))

    db.commit()
    db.refresh(claim)

    from ..db import SessionLocal
    background_tasks.add_task(_process_claim, claim.id, SessionLocal)

    return _claim_to_response(claim, member)


@router.get("", response_model=list[ClaimResponse])
def list_claims(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Claim).options(
        selectinload(Claim.member),
        selectinload(Claim.decision).selectinload(Decision.line_items),
    )
    if status:
        q = q.filter(Claim.status == status)
    claims = q.order_by(Claim.created_at.desc()).offset(skip).limit(limit).all()
    return [_claim_to_response(c, c.member) for c in claims]


@router.get("/{claim_id}", response_model=ClaimResponse)
def get_claim(claim_id: int, db: Session = Depends(get_db)):
    claim = (
        db.query(Claim)
        .options(
            selectinload(Claim.member),
            selectinload(Claim.decision).selectinload(Decision.line_items),
            selectinload(Claim.documents),
            selectinload(Claim.extracted_fields),
            selectinload(Claim.review_actions),
        )
        .filter(Claim.id == claim_id)
        .first()
    )
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _claim_to_response(claim, claim.member)


@router.post("/{claim_id}/review", response_model=ReviewActionResponse)
def submit_review(
    claim_id: int,
    body: ReviewActionCreate,
    db: Session = Depends(get_db),
):
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status not in ("manual_review", "decided"):
        raise HTTPException(status_code=400, detail="Claim is not in a reviewable state")

    action = ReviewAction(
        claim_id=claim.id,
        action=body.action,
        override_decision=body.override_decision,
        override_amount=body.override_amount,
        reviewer_notes=body.reviewer_notes,
    )
    db.add(action)

    if claim.decision:
        claim.decision.decision = "DECIDED_BY_HUMAN"
        if body.override_amount is not None:
            claim.decision.approved_amount = body.override_amount
        claim.decision.notes = (claim.decision.notes or "") + f"\n[Override] {body.reviewer_notes}"

    claim.status = "decided_by_human"
    db.commit()
    db.refresh(action)
    return action


def _claim_to_response(claim: Claim, member: Optional[Member]) -> ClaimResponse:
    decision_resp = None
    if claim.decision:
        d = claim.decision
        decision_resp = DecisionResponse(
            id=d.id,
            decision=d.decision,
            approved_amount=d.approved_amount,
            total_copay=d.total_copay,
            total_discount=d.total_discount,
            rejection_reasons=d.rejection_reasons or [],
            flags=d.flags or [],
            confidence_score=d.confidence_score,
            notes=d.notes,
            next_steps=d.next_steps,
            reasoning_steps=d.reasoning_steps or [],
            line_items=[
                {
                    "id": li.id, "name": li.name, "category": li.category,
                    "claimed_amount": li.claimed_amount, "approved_amount": li.approved_amount,
                    "status": li.status, "reason": li.reason,
                }
                for li in (d.line_items or [])
            ],
            created_at=d.created_at,
        )
    return ClaimResponse(
        id=claim.id,
        claim_ref=claim.claim_ref,
        member_id=claim.member_id,
        member_name=member.name if member else None,
        hospital=claim.hospital,
        treatment_date=claim.treatment_date,
        submission_date=claim.submission_date,
        claim_amount=claim.claim_amount,
        status=claim.status,
        cashless_request=claim.cashless_request,
        created_at=claim.created_at,
        decision=decision_resp,
    )
