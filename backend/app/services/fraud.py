from dataclasses import dataclass, field


@dataclass
class FraudResult:
    flagged: bool = False
    flags: list[str] = field(default_factory=list)


def check_fraud(
    previous_claims_same_day: int,
    claim_amount: float,
    extraction_confidence: float = 1.0,
) -> FraudResult:
    flags: list[str] = []

    if previous_claims_same_day >= 2:
        flags.append(f"Multiple claims same day ({previous_claims_same_day + 1} total)")

    if claim_amount > 25000:
        flags.append(f"High-value claim (₹{claim_amount:,.0f} > ₹25,000)")

    if extraction_confidence < 0.5:
        flags.append("Low document extraction confidence — possible illegible/modified document")

    return FraudResult(flagged=bool(flags), flags=flags)
