from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Date, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[str] = mapped_column(String(50), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Member(Base):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    join_date: Mapped[date] = mapped_column(Date)
    is_dependent: Mapped[bool] = mapped_column(Boolean, default=False)
    employee_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(200), unique=True, nullable=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="employee")

    claims: Mapped[list["Claim"]] = relationship("Claim", back_populates="member")


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_ref: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    member_id: Mapped[str] = mapped_column(String(50), ForeignKey("members.member_id"), index=True)
    hospital: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    treatment_date: Mapped[date] = mapped_column(Date, index=True)
    submission_date: Mapped[date] = mapped_column(Date)
    claim_amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    # submitted | processing | decided | manual_review | decided_by_human
    cashless_request: Mapped[bool] = mapped_column(Boolean, default=False)
    previous_claims_same_day: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped["Member"] = relationship("Member", back_populates="claims")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="claim", cascade="all, delete-orphan")
    extracted_fields: Mapped[list["ExtractedFields"]] = relationship("ExtractedFields", back_populates="claim", cascade="all, delete-orphan")
    decision: Mapped[Optional["Decision"]] = relationship("Decision", back_populates="claim", uselist=False, cascade="all, delete-orphan")
    review_actions: Mapped[list["ReviewAction"]] = relationship("ReviewAction", back_populates="claim", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(Integer, ForeignKey("claims.id"))
    doc_type: Mapped[str] = mapped_column(String(50))
    # prescription | bill | diagnostic_report | pharmacy_bill
    file_path: Mapped[str] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(200))
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped["Claim"] = relationship("Claim", back_populates="documents")


class ExtractedFields(Base):
    __tablename__ = "extracted_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(Integer, ForeignKey("claims.id"))
    doc_type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSON)
    extraction_confidence: Mapped[float] = mapped_column(Float, default=1.0)
    extracted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped["Claim"] = relationship("Claim", back_populates="extracted_fields")


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(Integer, ForeignKey("claims.id"), unique=True)
    decision: Mapped[str] = mapped_column(String(20))
    # APPROVED | REJECTED | PARTIAL | MANUAL_REVIEW
    approved_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_copay: Mapped[float] = mapped_column(Float, default=0.0)
    total_discount: Mapped[float] = mapped_column(Float, default=0.0)
    rejection_reasons: Mapped[list] = mapped_column(JSON, default=list)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_steps: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reasoning_steps: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped["Claim"] = relationship("Claim", back_populates="decision")
    line_items: Mapped[list["DecisionLineItem"]] = relationship("DecisionLineItem", back_populates="decision", cascade="all, delete-orphan")


class DecisionLineItem(Base):
    __tablename__ = "decision_line_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    decision_id: Mapped[int] = mapped_column(Integer, ForeignKey("decisions.id"))
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50))
    claimed_amount: Mapped[float] = mapped_column(Float)
    approved_amount: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20))
    # approved | rejected | partial
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    decision: Mapped["Decision"] = relationship("Decision", back_populates="line_items")


class ReviewAction(Base):
    __tablename__ = "review_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(Integer, ForeignKey("claims.id"))
    action: Mapped[str] = mapped_column(String(50))
    # override_approve | override_reject | flag_fraud | request_info
    override_decision: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    override_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reviewer_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped["Claim"] = relationship("Claim", back_populates="review_actions")
