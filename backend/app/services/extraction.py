"""
Claude multimodal vision extraction for medical documents.
Each doc type gets a separate call with a tool_use forced structured output.
All calls are parallelized via asyncio.gather.
"""

import asyncio
import base64
import json
from pathlib import Path
from typing import Optional

import anthropic
from pypdf import PdfReader

from ..config import settings
from ..schemas import (
    BillExtract,
    DiagnosticReportExtract,
    PharmacyBillExtract,
    PrescriptionExtract,
)

_client: Optional[anthropic.AsyncAnthropic] = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _encode_file(file_path: Path) -> tuple[str, str]:
    """Return (media_type, base64_data). Converts PDFs to images via first page."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        # Extract text instead of rasterizing for PDFs
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


def _build_content(media_type: str, data: str, prompt: str) -> list:
    if media_type == "text/plain":
        return [{"type": "text", "text": f"{prompt}\n\nDocument text:\n{data}"}]
    return [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
        {"type": "text", "text": prompt},
    ]


async def _extract_with_tool(file_path: Path, doc_type: str, tool_schema: dict, prompt: str) -> dict:
    client = get_client()
    media_type, data = _encode_file(file_path)
    content = _build_content(media_type, data, prompt)

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        tools=[{
            "name": "extract_document",
            "description": f"Extract structured fields from a medical {doc_type}",
            "input_schema": tool_schema,
        }],
        tool_choice={"type": "tool", "name": "extract_document"},
        messages=[{"role": "user", "content": content}],
    )

    for block in response.content:
        if block.type == "tool_use":
            return block.input

    return {}


async def extract_prescription(file_path: Path) -> PrescriptionExtract:
    schema = PrescriptionExtract.model_json_schema()
    prompt = (
        "Extract all fields from this medical prescription. "
        "Set extraction_confidence between 0 and 1 based on document clarity. "
        "If a field is not visible, leave it as an empty string."
    )
    raw = await _extract_with_tool(file_path, "prescription", schema, prompt)
    return PrescriptionExtract.model_validate(raw)


async def extract_bill(file_path: Path) -> BillExtract:
    schema = BillExtract.model_json_schema()
    prompt = (
        "Extract all fields from this medical bill/invoice. "
        "For each line item, classify category as: consultation, diagnostic, pharmacy, procedure, or other. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    raw = await _extract_with_tool(file_path, "bill", schema, prompt)
    return BillExtract.model_validate(raw)


async def extract_diagnostic_report(file_path: Path) -> DiagnosticReportExtract:
    schema = DiagnosticReportExtract.model_json_schema()
    prompt = (
        "Extract all fields from this diagnostic test report. "
        "For each test result, note if it's outside the normal range. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    raw = await _extract_with_tool(file_path, "diagnostic report", schema, prompt)
    return DiagnosticReportExtract.model_validate(raw)


async def extract_pharmacy_bill(file_path: Path) -> PharmacyBillExtract:
    schema = PharmacyBillExtract.model_json_schema()
    prompt = (
        "Extract all fields from this pharmacy bill. "
        "Set extraction_confidence between 0 and 1 based on document clarity."
    )
    raw = await _extract_with_tool(file_path, "pharmacy bill", schema, prompt)
    return PharmacyBillExtract.model_validate(raw)


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
    client = get_client()
    prompt = (
        f"Diagnosis: {diagnosis}\n"
        f"Medicines prescribed: {', '.join(medicines) if medicines else 'None'}\n"
        f"Tests ordered: {', '.join(tests) if tests else 'None'}\n\n"
        "Are these medicines and tests medically appropriate for this diagnosis? "
        "Consider standard medical protocols. Respond with appropriate (true/false), "
        "confidence (0-1), and a brief reasoning string."
    )

    tool_schema = {
        "type": "object",
        "properties": {
            "appropriate": {"type": "boolean"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
        },
        "required": ["appropriate", "confidence", "reasoning"],
    }

    response = await client.messages.create(
        model=settings.claude_model,
        max_tokens=256,
        tools=[{"name": "assess_necessity", "description": "Assess medical necessity", "input_schema": tool_schema}],
        tool_choice={"type": "tool", "name": "assess_necessity"},
        messages=[{"role": "user", "content": prompt}],
    )

    for block in response.content:
        if block.type == "tool_use":
            return block.input

    return {"appropriate": True, "confidence": 0.8, "reasoning": "Unable to assess"}
