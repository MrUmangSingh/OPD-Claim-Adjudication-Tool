import json
from datetime import date

from sqlalchemy.orm import Session

from ..auth import hash_password
from ..config import POLICY_FILE
from ..models import Member, Policy

SEED_MEMBERS = [
    {
        "member_id": "EMP001",
        "name": "Rajesh Kumar",
        "join_date": date(2024, 1, 1),
        "email": "rajesh.kumar@test",
        "role": "employee",
    },
    {
        "member_id": "EMP002",
        "name": "Priya Singh",
        "join_date": date(2024, 1, 1),
        "email": "priya.singh@test",
        "role": "employee",
    },
    {
        "member_id": "EMP003",
        "name": "Amit Verma",
        "join_date": date(2024, 1, 1),
        "email": "amit.verma@test",
        "role": "employee",
    },
    {
        "member_id": "EMP004",
        "name": "Sneha Reddy",
        "join_date": date(2024, 1, 1),
        "email": "sneha.reddy@test",
        "role": "employee",
    },
    {
        "member_id": "EMP005",
        "name": "Vikram Joshi",
        "join_date": date(2024, 9, 1),
        "email": "vikram.joshi@test",
        "role": "employee",
    },
    {
        "member_id": "EMP006",
        "name": "Kavita Nair",
        "join_date": date(2024, 1, 1),
        "email": "kavita.nair@test",
        "role": "employee",
    },
    {
        "member_id": "EMP007",
        "name": "Suresh Patil",
        "join_date": date(2024, 1, 1),
        "email": "suresh.patil@test",
        "role": "employee",
    },
    {
        "member_id": "EMP008",
        "name": "Ravi Menon",
        "join_date": date(2024, 1, 1),
        "email": "ravi.menon@test",
        "role": "employee",
    },
    {
        "member_id": "EMP009",
        "name": "Anita Desai",
        "join_date": date(2024, 1, 1),
        "email": "anita.desai@test",
        "role": "employee",
    },
    {
        "member_id": "EMP010",
        "name": "Deepak Shah",
        "join_date": date(2024, 1, 1),
        "email": "deepak.shah@test",
        "role": "employee",
    },
    {
        "member_id": "ADM001",
        "name": "Admin",
        "join_date": date(2024, 1, 1),
        "email": "admin@test",
        "role": "admin",
    },
]

_DEFAULT_EMPLOYEE_PASSWORD = "password123"
_DEFAULT_ADMIN_PASSWORD = "admin123"


def seed_database(db: Session) -> None:
    if not db.query(Policy).first():
        with open(POLICY_FILE) as f:
            payload = json.load(f)
        db.add(Policy(policy_id=payload["policy_id"], payload=payload))

    existing = {m.member_id: m for m in db.query(Member).all()}
    for m in SEED_MEMBERS:
        default_pw = (
            _DEFAULT_ADMIN_PASSWORD
            if m["role"] == "admin"
            else _DEFAULT_EMPLOYEE_PASSWORD
        )
        if m["member_id"] not in existing:
            db.add(
                Member(
                    member_id=m["member_id"],
                    name=m["name"],
                    join_date=m["join_date"],
                    email=m["email"],
                    role=m["role"],
                    password_hash=hash_password(default_pw),
                )
            )
        else:
            # Backfill auth fields for existing rows
            member = existing[m["member_id"]]
            if not member.password_hash:
                member.password_hash = hash_password(default_pw)
            if not member.email:
                member.email = m["email"]
            if not member.role or member.role == "employee":
                member.role = m["role"]

    db.commit()
