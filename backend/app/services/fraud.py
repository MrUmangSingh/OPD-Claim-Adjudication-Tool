from dataclasses import dataclass, field
from difflib import SequenceMatcher


_NAME_TITLES = {"mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "mx"}
NAME_SIMILARITY_THRESHOLD = 0.7


def _normalize_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c.isspace() else " " for c in name.lower())
    tokens = [t for t in cleaned.split() if t and t not in _NAME_TITLES]
    return " ".join(tokens)


def _name_similarity(a: str, b: str) -> float:
    na, nb = _normalize_name(a), _normalize_name(b)
    if not na or not nb:
        return 1.0  # nothing to compare → don't flag
    if na == nb:
        return 1.0
    tokens_a, tokens_b = set(na.split()), set(nb.split())
    if tokens_a & tokens_b and (tokens_a <= tokens_b or tokens_b <= tokens_a):
        # one is a subset of the other (e.g. "rajesh" vs "rajesh kumar")
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


@dataclass
class FraudResult:
    flagged: bool = False
    flags: list[str] = field(default_factory=list)


def check_fraud(
    previous_claims_same_day: int,
    claim_amount: float,
    extraction_confidence: float = 1.0,
    document_patient_name: str = "",
    member_name: str = "",
) -> FraudResult:
    flags: list[str] = []

    if previous_claims_same_day >= 2:
        flags.append(f"Multiple claims same day ({previous_claims_same_day + 1} total)")

    if claim_amount > 25000:
        flags.append(f"High-value claim (₹{claim_amount:,.0f} > ₹25,000)")

    if extraction_confidence < 0.5:
        flags.append("Low document extraction confidence — possible illegible/modified document")

    if document_patient_name and member_name:
        similarity = _name_similarity(document_patient_name, member_name)
        if similarity < NAME_SIMILARITY_THRESHOLD:
            flags.append(
                f"Patient name mismatch: document='{document_patient_name}' vs member='{member_name}'"
            )

    return FraudResult(flagged=bool(flags), flags=flags)
