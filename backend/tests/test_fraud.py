from app.services.fraud import check_fraud, _name_similarity


class TestNameSimilarity:
    def test_exact_match(self):
        assert _name_similarity("Rajesh Kumar", "Rajesh Kumar") == 1.0

    def test_subset_passes(self):
        assert _name_similarity("Rajesh", "Rajesh Kumar") == 1.0

    def test_title_stripped(self):
        assert _name_similarity("Mr. Rajesh Kumar", "Rajesh Kumar") == 1.0
        assert _name_similarity("Dr Rajesh", "Rajesh Kumar") == 1.0

    def test_different_names_score_low(self):
        assert _name_similarity("Ramesh", "Rajesh Kumar") < 0.7

    def test_empty_does_not_score_low(self):
        assert _name_similarity("", "Rajesh Kumar") == 1.0
        assert _name_similarity("Rajesh Kumar", "") == 1.0


class TestCheckFraudNameMismatch:
    def test_mismatch_flags(self):
        result = check_fraud(
            previous_claims_same_day=0,
            claim_amount=2000,
            document_patient_name="Ramesh",
            member_name="Rajesh Kumar",
        )
        assert result.flagged is True
        assert any("Patient name mismatch" in f for f in result.flags)

    def test_partial_match_does_not_flag(self):
        result = check_fraud(
            previous_claims_same_day=0,
            claim_amount=2000,
            document_patient_name="Rajesh",
            member_name="Rajesh Kumar",
        )
        assert result.flagged is False

    def test_titled_name_does_not_flag(self):
        result = check_fraud(
            previous_claims_same_day=0,
            claim_amount=2000,
            document_patient_name="Mr. Rajesh K",
            member_name="Rajesh Kumar",
        )
        assert result.flagged is False

    def test_missing_document_name_does_not_flag(self):
        result = check_fraud(
            previous_claims_same_day=0,
            claim_amount=2000,
            document_patient_name="",
            member_name="Rajesh Kumar",
        )
        assert result.flagged is False

    def test_existing_signals_still_work(self):
        result = check_fraud(
            previous_claims_same_day=2,
            claim_amount=30000,
            extraction_confidence=0.4,
            document_patient_name="Rajesh Kumar",
            member_name="Rajesh Kumar",
        )
        assert result.flagged is True
        assert len(result.flags) == 3  # same-day + high-value + low-confidence
