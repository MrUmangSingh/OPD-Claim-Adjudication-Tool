"""
Claude multimodal vision extraction via LangChain's ChatAnthropic.
Uses with_structured_output (tool_use under the hood) for typed extraction.
All doc-type calls are parallelized via asyncio.gather.
"""

import asyncio
import base64
from pathlib import Path
from typing import Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from pypdf import PdfReader

from ..config import settings
from ..schemas import (
    BillExtract,
    DiagnosticReportExtract,
    PharmacyBillExtract,
    PrescriptionExtract,
)

_llm: Optional[ChatAnthropic] = None


def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_base_url,
            temperature=0.1,
            max_retries=3,
        )
    return _llm


def _encode_file(file_path: Path) -> tuple[str, str]:
    """Return (media_type, base64_data|text). PDFs are text-extracted."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(file_path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        return "text/plain", text
    elif suffix in (".jpg", ".jpeg"):
        with open(file_path, "rb") as f:
            return "image/jpeg", base64.standard_b64encode(f.read()).decode()
    elif suffix == ".png":
        with open(file_path, "rb") as f:
            return "image/png", base64.standard_b64encode(f.read()).decode()
    else:
        with open(file_path, "rb") as f:
            return "image/jpeg", base64.standard_b64encode(f.read()).decode()


def _build_message(media_type: str, data: str, prompt: str) -> HumanMessage:
    if media_type == "text/plain":
        return HumanMessage(content=f"{prompt}\n\nDocument text:\n{data}")
    return HumanMessage(content=[
        {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{data}"}},
        {"type": "text", "text": prompt},
    ])


async def _extract_typed(file_path: Path, schema, prompt: str):
    """Run structured extraction via with_structured_output on a thread (LangChain is sync)."""
    llm = get_llm()
    chain = llm.with_structured_output(schema)
    media_type, data = _encode_file(file_path)
    message = _build_message(media_type, data, prompt)
    # LangChain's invoke is synchronous; run in thread to avoid blocking the event loop
    return await asyncio.get_event_loop().run_in_executor(None, chain.invoke, [message])


async def extract_prescription(file_path: Path) -> PrescriptionExtract:
    prompt = (
        "Extract all fields from this medical prescription. "
        "Set extraction_confidence between 0 and 1 based on document clarity. "
        "If a field is not visible, leave it as an empty string."
    )
    result = await _extract_typed(file_path, PrescriptionExtract, prompt)
    return result if isinstance(result, PrescriptionExtract) else PrescriptionExtract.model_validate(result)


async def extract_bill(file_path: Path) -> BillExtract:
    prompt = (
        "Extract all fields from this medical bill/invoice. "
        "For each line item, classify category as: consultation, diagnostic, pharmacy, procedure, or other. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    result = await _extract_typed(file_path, BillExtract, prompt)
    return result if isinstance(result, BillExtract) else BillExtract.model_validate(result)


async def extract_diagnostic_report(file_path: Path) -> DiagnosticReportExtract:
    prompt = (
        "Extract all fields from this diagnostic test report. "
        "For each test result, note if it's outside the normal range. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    result = await _extract_typed(file_path, DiagnosticReportExtract, prompt)
    return result if isinstance(result, DiagnosticReportExtract) else DiagnosticReportExtract.model_validate(result)


async def extract_pharmacy_bill(file_path: Path) -> PharmacyBillExtract:
    prompt = (
        "Extract all fields from this pharmacy bill. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    result = await _extract_typed(file_path, PharmacyBillExtract, prompt)
    return result if isinstance(result, PharmacyBillExtract) else PharmacyBillExtract.model_validate(result)


EXTRACTOR_MAP = {
    "prescription": extract_prescription,
    "bill": extract_bill,
    "diagnostic_report": extract_diagnostic_report,
    "pharmacy_bill": extract_pharmacy_bill,
}


async def extract_documents(doc_paths: list[tuple[str, Path]]) -> dict[str, dict]:
    """
    Run all extraction calls in parallel.
    doc_paths: list of (doc_type, file_path)
    Returns {doc_type: extracted_dict}
    """
    async def _extract_one(doc_type: str, path: Path) -> tuple[str, dict]:
        extractor = EXTRACTOR_MAP.get(doc_type)
        if extractor is None:
            return doc_type, {}
        result = await extractor(path)
        return doc_type, result.model_dump()

    results = await asyncio.gather(*[_extract_one(t, p) for t, p in doc_paths])
    return dict(results)


async def assess_medical_necessity(
    diagnosis: str,
    medicines: list[str],
    tests: list[str],
) -> dict:
    """Ask Claude if the meds/tests are medically appropriate for the diagnosis."""
    from pydantic import BaseModel, Field

    class NecessityResult(BaseModel):
        appropriate: bool
        confidence: float = Field(ge=0, le=1)
        reasoning: str

    llm = get_llm()
    chain = llm.with_structured_output(NecessityResult)

    prompt = (
        f"Diagnosis: {diagnosis}\n"
        f"Medicines prescribed: {', '.join(medicines) if medicines else 'None'}\n"
        f"Tests ordered: {', '.join(tests) if tests else 'None'}\n\n"
        "Are these medicines and tests medically appropriate for this diagnosis? "
        "Consider standard medical protocols."
    )

    result = await asyncio.get_event_loop().run_in_executor(
        None, chain.invoke, [HumanMessage(content=prompt)]
    )
    return result.model_dump() if hasattr(result, "model_dump") else {"appropriate": True, "confidence": 0.8, "reasoning": "Unable to assess"}
