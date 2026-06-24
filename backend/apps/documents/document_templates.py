"""
Template registry + ATS rules for the AI Application Document Generator.

Two independent axes:
  * **Content style** — the *voice* of the writing (formal, academic, …). Passed
    to the model as guidance.
  * **Visual template** — the *export layout* (ATS-safe single-column vs premium
    letter). Drives the deterministic PDF/DOCX renderers.

Plus deterministic ATS validation (``validate_ats_structure``) — no AI. Six
well-built templates only; we deliberately avoid many average ones.
"""

from __future__ import annotations

# ---- Content styles --------------------------------------------------------

CONTENT_STYLES = [
    {"key": "formal", "label": "Formal"},
    {"key": "warm_professional", "label": "Warm professional"},
    {"key": "academic", "label": "Academic"},
    {"key": "scholarship_focused", "label": "Scholarship-focused"},
    {"key": "embassy_safe", "label": "Embassy-safe"},
    {"key": "corporate", "label": "Corporate"},
    {"key": "concise", "label": "Concise"},
    {"key": "confident", "label": "Confident"},
]
_CONTENT_STYLE_KEYS = {s["key"] for s in CONTENT_STYLES}
DEFAULT_CONTENT_STYLE = "formal"


# ---- Document types --------------------------------------------------------
# kind: "cv" (resume/CV — structured + ATS-relevant) | "letter" | "email".

DOCUMENT_TYPES = {
    "ats_resume": {"label": "ATS resume", "kind": "cv", "credit_cost": 8, "ats_relevant": True},
    "academic_cv": {"label": "Academic CV", "kind": "cv", "credit_cost": 8, "ats_relevant": True},
    "scholarship_cv": {"label": "Scholarship CV", "kind": "cv", "credit_cost": 8, "ats_relevant": True},
    "cover_letter": {"label": "Cover letter", "kind": "letter", "credit_cost": 5, "ats_relevant": False},
    "motivation_letter": {"label": "Motivation letter", "kind": "letter", "credit_cost": 5, "ats_relevant": False},
    "statement_of_purpose": {"label": "Statement of purpose", "kind": "letter", "credit_cost": 8, "ats_relevant": False},
    "recommendation_request_email": {"label": "Recommendation request email", "kind": "email", "credit_cost": 3, "ats_relevant": False},
    "application_email": {"label": "Application email", "kind": "email", "credit_cost": 3, "ats_relevant": False},
    "missing_document_explanation": {"label": "Missing document explanation", "kind": "letter", "credit_cost": 5, "ats_relevant": False},
    "visa_explanation_letter": {"label": "Visa explanation letter", "kind": "letter", "credit_cost": 5, "ats_relevant": False},
    "other": {"label": "Other", "kind": "letter", "credit_cost": 5, "ats_relevant": False},
}


def get_document_credit_cost(document_type: str) -> int:
    return DOCUMENT_TYPES.get(document_type, DOCUMENT_TYPES["other"])["credit_cost"]


def document_kind(document_type: str) -> str:
    return DOCUMENT_TYPES.get(document_type, DOCUMENT_TYPES["other"])["kind"]


def is_cv_type(document_type: str) -> bool:
    return document_kind(document_type) == "cv"


def normalize_content_style(style: str | None) -> str:
    return style if style in _CONTENT_STYLE_KEYS else DEFAULT_CONTENT_STYLE


# ---- Visual templates (6 only) ---------------------------------------------

_CV_TYPES = ["ats_resume", "academic_cv", "scholarship_cv"]
_LETTER_TYPES = [
    "cover_letter", "motivation_letter", "statement_of_purpose",
    "recommendation_request_email", "application_email",
    "missing_document_explanation", "visa_explanation_letter", "other",
]

TEMPLATES = [
    {
        "key": "ats_classic",
        "label": "ATS Classic",
        "description": "ATS-safe single column, standard headings, no tables/graphics. Best for online job portals.",
        "document_types": _CV_TYPES,
        "export_formats": ["pdf", "docx"],
        "ats_safe": True,
        "recommended_for": ["ats_resume"],
        "kind": "cv",
        "pro_only": False,
    },
    {
        "key": "ats_modern",
        "label": "ATS Modern",
        "description": "ATS-safe single column with clean spacing and subtle hierarchy. Still parser-friendly.",
        "document_types": _CV_TYPES,
        "export_formats": ["pdf", "docx"],
        "ats_safe": True,
        "recommended_for": ["ats_resume"],
        "kind": "cv",
        "pro_only": False,
    },
    {
        "key": "academic_cv",
        "label": "Academic CV",
        "description": "Formal academic structure emphasising education, research, and publications.",
        "document_types": ["academic_cv"],
        "export_formats": ["pdf", "docx"],
        "ats_safe": True,
        "recommended_for": ["academic_cv"],
        "kind": "cv",
        "pro_only": False,
    },
    {
        "key": "scholarship_cv",
        "label": "Scholarship CV",
        "description": "Education, leadership, awards, and projects emphasis — optimised for human review.",
        "document_types": ["scholarship_cv"],
        "export_formats": ["pdf", "docx"],
        "ats_safe": True,
        "recommended_for": ["scholarship_cv"],
        "kind": "cv",
        "pro_only": False,
    },
    {
        "key": "formal_letter",
        "label": "Formal Letter",
        "description": "Official plain letter format — embassy, university, and company safe.",
        "document_types": _LETTER_TYPES,
        "export_formats": ["pdf", "docx"],
        "ats_safe": True,
        "recommended_for": ["motivation_letter", "visa_explanation_letter", "missing_document_explanation"],
        "kind": "letter",
        "pro_only": False,
    },
    {
        "key": "premium_letter",
        "label": "Premium Letter",
        "description": "Premium minimal layout with a professional header — best for human review and direct sharing.",
        "document_types": _LETTER_TYPES,
        "export_formats": ["pdf"],
        "ats_safe": False,
        "recommended_for": ["cover_letter", "statement_of_purpose"],
        "kind": "letter",
        "pro_only": False,
    },
]
_TEMPLATE_BY_KEY = {t["key"]: t for t in TEMPLATES}


def get_template(template_key: str) -> dict | None:
    return _TEMPLATE_BY_KEY.get(template_key)


def templates_for_document_type(document_type: str) -> list[dict]:
    return [t for t in TEMPLATES if document_type in t["document_types"]]


def template_supports(template_key: str, document_type: str, export_format: str) -> bool:
    t = _TEMPLATE_BY_KEY.get(template_key)
    if not t:
        return False
    return document_type in t["document_types"] and export_format in t["export_formats"]


def recommend_template(document_type: str, application_type=None, destination=None) -> str:
    """Deterministic best-fit template for a document type."""
    if document_type == "academic_cv":
        return "academic_cv"
    if document_type == "scholarship_cv":
        return "scholarship_cv"
    if is_cv_type(document_type):
        return "ats_classic"
    # Letters/emails: embassy/visa/explanation → formal; otherwise formal too
    # (premium is opt-in for human-review sharing).
    return "formal_letter"


def build_template_registry() -> dict:
    """Owner-agnostic registry payload for the templates endpoint."""
    return {
        "content_styles": CONTENT_STYLES,
        "document_types": [
            {
                "key": key,
                "label": meta["label"],
                "kind": meta["kind"],
                "credit_cost": meta["credit_cost"],
                "ats_relevant": meta["ats_relevant"],
                "recommended_template": recommend_template(key),
            }
            for key, meta in DOCUMENT_TYPES.items()
        ],
        "templates": TEMPLATES,
    }


# ---- ATS validation (deterministic; no AI) ---------------------------------

ATS_HEADINGS = [
    "Summary", "Education", "Experience", "Projects", "Skills",
    "Certifications", "Awards", "Leadership", "Languages", "Publications",
]


def validate_ats_structure(structured_content: dict, template_key: str) -> dict:
    """
    Deterministic ATS check for a generated CV/resume structure.

    Returns ``{ats_safe, score, warnings}``. Score starts at 100 and drops for
    each issue (missing core sections, no measurable achievements, a non-ATS
    template). Non-CV content always returns a clean, neutral result.
    """
    content = structured_content if isinstance(structured_content, dict) else {}
    warnings: list[str] = []
    score = 100

    template = _TEMPLATE_BY_KEY.get(template_key)
    template_ats_safe = bool(template and template["ats_safe"])
    if not template_ats_safe:
        warnings.append("Avoid visual templates for online job portals.")
        score -= 20

    def _has(section: str) -> bool:
        value = content.get(section)
        return bool(value) and (not isinstance(value, (list, str)) or len(value) > 0)

    if not (_has("summary")):
        warnings.append("Add a Summary section for ATS compatibility.")
        score -= 10
    if not _has("education"):
        warnings.append("Missing Education section.")
        score -= 15
    if not (_has("experience") or _has("projects")):
        warnings.append("Add Experience or Projects with measurable achievements.")
        score -= 15
    if not _has("skills"):
        warnings.append("Missing Skills section.")
        score -= 10

    # Measurable achievements heuristic: a digit somewhere in experience bullets.
    experience = content.get("experience") or []
    has_metric = False
    if isinstance(experience, list):
        for item in experience:
            blob = " ".join(str(v) for v in (item.values() if isinstance(item, dict) else [item]))
            if any(ch.isdigit() for ch in blob):
                has_metric = True
                break
    if experience and not has_metric:
        warnings.append("No measurable achievements found — add metrics/results.")
        score -= 5

    score = max(0, min(100, score))
    return {
        "ats_safe": template_ats_safe and not any(
            w.startswith("Missing") for w in warnings
        ),
        "score": score,
        "warnings": warnings,
    }
