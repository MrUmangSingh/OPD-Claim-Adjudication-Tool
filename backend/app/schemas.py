from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


# ── Claim submission ──────────────────────────────────────────────────────────

class ClaimCreate(BaseModel):
    member_id: str
    treatment_date: date
    claim_amount: float
    hospital: Optional[str] = None
    cashless_request: bool = False
    previous_claims_same_day: int = 0


class ClaimResponse(BaseModel):
    id: int
    claim_ref: str
    member_id: str
    member_name: Optional[str] = None
    hospital: Optional[str] = None
    treatment_date: date
    submission_date: date
    claim_amount: float
    status: str
    cashless_request: bool
    created_at: datetime
    decision: Optional["DecisionResponse"] = None
    decided_by_human: bool = False
    effective_decision: Optional[str] = None  # APPROVED/REJECTED/PARTIAL regardless of who decided

    model_config = {"from_attributes": True}


# ── Extraction schemas (for Claude tool_use) ─────────────────────────────────

class MedicineItem(BaseModel):
    name: str
    strength: Optional[str] = None
    dosage: Optional[str] = None
    duration: Optional[str] = None


class PrescriptionExtract(BaseModel):
    doctor_name: str = ""
    doctor_reg: str = ""
    doctor_qualification: str = ""
    clinic_name: str = ""
    date: str = ""
    patient_name: str = ""
    patient_age: str = ""
    diagnosis: str = ""
    chief_complaints: list[str] = Field(default_factory=list)
    medicines_prescribed: list[str] = Field(default_factory=list)
    tests_advised: list[str] = Field(default_factory=list)
    follow_up_date: str = ""
    extraction_confidence: float = Field(default=1.0, ge=0, le=1)


class BillLineItem(BaseModel):
    name: str
    category: str  # consultation | diagnostic | pharmacy | procedure | other
    amount: float


class BillExtract(BaseModel):
    bill_no: str = ""
    hospital_name: str = ""
    date: str = ""
    patient_name: str = ""
    line_items: list[BillLineItem] = Field(default_factory=list)
    subtotal: float = 0.0
    gst: float = 0.0
    total: float = 0.0
    payment_mode: str = ""
    extraction_confidence: float = Field(default=1.0, ge=0, le=1)


class DiagnosticTestResult(BaseModel):
    name: str
    result: str
    normal_range: str = ""
    abnormal: bool = False


class DiagnosticReportExtract(BaseModel):
    lab_name: str = ""
    date: str = ""
    patient_name: str = ""
    referred_by: str = ""
    tests: list[DiagnosticTestResult] = Field(default_factory=list)
    extraction_confidence: float = Field(default=1.0, ge=0, le=1)


class PharmacyItem(BaseModel):
    medicine: str
    qty: int = 0
    amount: float = 0.0


class PharmacyBillExtract(BaseModel):
    pharmacy_name: str = ""
    date: str = ""
    patient_name: str = ""
    doctor_name: str = ""
    items: list[PharmacyItem] = Field(default_factory=list)
    total: float = 0.0
    extraction_confidence: float = Field(default=1.0, ge=0, le=1)


# ── Decision ─────────────────────────────────────────────────────────────────

class DecisionLineItemResponse(BaseModel):
    id: int
    name: str
    category: str
    claimed_amount: float
    approved_amount: float
    status: str
    reason: Optional[str] = None

    model_config = {"from_attributes": True}


class ReasoningStep(BaseModel):
    step: int
    name: str
    passed: bool
    details: str
    reasons: list[str] = Field(default_factory=list)


class DecisionResponse(BaseModel):
    id: int
    decision: str
    approved_amount: float
    total_copay: float
    total_discount: float
    rejection_reasons: list[str]
    flags: list[str]
    confidence_score: float
    notes: Optional[str] = None
    next_steps: Optional[str] = None
    reasoning_steps: list[Any] = Field(default_factory=list)
    line_items: list[DecisionLineItemResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Manual review ─────────────────────────────────────────────────────────────

class ReviewActionCreate(BaseModel):
    action: str  # override_approve | override_reject
    override_decision: str
    override_amount: Optional[float] = None
    reviewer_notes: str = ""


class ReviewActionResponse(BaseModel):
    id: int
    action: str
    override_decision: Optional[str]
    override_amount: Optional[float]
    reviewer_notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Evaluation ────────────────────────────────────────────────────────────────

class EvalCaseResult(BaseModel):
    case_id: str
    case_name: str
    expected_decision: str
    actual_decision: str
    expected_amount: Optional[float]
    actual_amount: float
    expected_confidence: Optional[float]
    actual_confidence: float
    decision_match: bool
    amount_match: bool
    latency_ms: int
    rejection_reasons: list[str] = Field(default_factory=list)
    notes: str = ""


class EvalResult(BaseModel):
    total_cases: int
    decision_accuracy: float
    amount_accuracy: float
    avg_latency_ms: float
    cases: list[EvalCaseResult]


# Update forward reference
ClaimResponse.model_rebuild()
