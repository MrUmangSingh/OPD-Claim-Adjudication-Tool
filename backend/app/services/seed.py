import json
from datetime import date
from sqlalchemy.orm import Session
from ..models import Policy, Member
from ..config import POLICY_FILE


SEED_MEMBERS = [
    {"member_id": "EMP001", "name": "Rajesh Kumar",  "join_date": date(2024, 1, 1)},
    {"member_id": "EMP002", "name": "Priya Singh",   "join_date": date(2024, 1, 1)},
    {"member_id": "EMP003", "name": "Amit Verma",    "join_date": date(2024, 1, 1)},
    {"member_id": "EMP004", "name": "Sneha Reddy",   "join_date": date(2024, 1, 1)},
    {"member_id": "EMP005", "name": "Vikram Joshi",  "join_date": date(2024, 9, 1)},
    {"member_id": "EMP006", "name": "Kavita Nair",   "join_date": date(2024, 1, 1)},
    {"member_id": "EMP007", "name": "Suresh Patil",  "join_date": date(2024, 1, 1)},
    {"member_id": "EMP008", "name": "Ravi Menon",    "join_date": date(2024, 1, 1)},
    {"member_id": "EMP009", "name": "Anita Desai",   "join_date": date(2024, 1, 1)},
    {"member_id": "EMP010", "name": "Deepak Shah",   "join_date": date(2024, 1, 1)},
]


def seed_database(db: Session) -> None:
    if not db.query(Policy).first():
        with open(POLICY_FILE) as f:
            payload = json.load(f)
        db.add(Policy(policy_id=payload["policy_id"], payload=payload))

    existing_ids = {m.member_id for m in db.query(Member).all()}
    for m in SEED_MEMBERS:
        if m["member_id"] not in existing_ids:
            db.add(Member(**m))

    db.commit()
