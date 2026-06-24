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


# Per-document-type presets — recommended voice/template, length guidance, the
# "best for" line shown in the UI, and the quality rules the prompt enforces.
DOCUMENT_TYPE_PRESETS = {
    "ats_resume": {
        "recommended_style": "corporate",
        "length_guidance": "One page where possible; concise action+impact bullets.",
        "best_for": "Online job portals and recruiter ATS systems.",
        "description": "A clean, parser-safe resume tailored to the role.",
        "quality_rules": [
            "Single column, standard headings, no tables/graphics.",
            "Bullets: action + impact + evidence; add metrics where they exist.",
            "Mirror the role's key skills/keywords when present in context.",
        ],
    },
    "academic_cv": {
        "recommended_style": "academic",
        "length_guidance": "Longer-form; full education, research, and publications.",
        "best_for": "University and academic/research applications.",
        "description": "A formal academic CV emphasising education and research.",
        "quality_rules": [
            "Emphasise education, research, projects, and publications.",
            "Formal academic tone; clear chronological structure.",
        ],
    },
    "scholarship_cv": {
        "recommended_style": "scholarship_focused",
        "length_guidance": "1–2 pages; lead with education, leadership, awards.",
        "best_for": "Scholarship committees (human review).",
        "description": "Education, leadership, awards, and impact for committees.",
        "quality_rules": [
            "Emphasise academic fit, leadership, impact, goals, and alignment.",
            "Human-review friendly; no graphics or gimmicks.",
        ],
    },
    "cover_letter": {
        "recommended_style": "corporate",
        "length_guidance": "3–4 tight paragraphs on one page.",
        "best_for": "Job and internship applications.",
        "description": "A focused cover letter matching the role.",
        "quality_rules": [
            "Structure: why this role -> relevant background -> proof -> fit -> close.",
            "Emphasise role fit, skills, evidence, and concise outcomes.",
        ],
    },
    "motivation_letter": {
        "recommended_style": "formal",
        "length_guidance": "One page; specific and natural, not robotic.",
        "best_for": "University, scholarship, and programme applications.",
        "description": "A specific, application-aware motivation letter.",
        "quality_rules": [
            "Structure: why this application -> background -> proof -> fit -> next step.",
            "Natural, formal tone; no generic filler.",
        ],
    },
    "statement_of_purpose": {
        "recommended_style": "academic",
        "length_guidance": "About one page; focused narrative with evidence.",
        "best_for": "Graduate and research programme applications.",
        "description": "A focused statement of purpose with concrete evidence.",
        "quality_rules": [
            "Structure: goal -> relevant background -> proof -> fit with programme -> plan.",
            "Specific and evidence-led; avoid clichés.",
        ],
    },
    "recommendation_request_email": {
        "recommended_style": "warm_professional",
        "length_guidance": "Short and courteous — a few sentences.",
        "best_for": "Asking a referee for a recommendation.",
        "description": "A courteous, specific recommendation request.",
        "quality_rules": ["Be brief, specific, and respectful of the referee's time."],
    },
    "application_email": {
        "recommended_style": "concise",
        "length_guidance": "Short; clear subject and ask.",
        "best_for": "Submitting or following up on an application.",
        "description": "A concise, professional application email.",
        "quality_rules": ["Lead with the purpose; keep it short and direct."],
    },
    "missing_document_explanation": {
        "recommended_style": "formal",
        "length_guidance": "Short and factual.",
        "best_for": "Explaining a missing document to an authority.",
        "description": "A clear, factual explanation of a missing document.",
        "quality_rules": ["Plain, factual, and direct; no emotion or exaggeration."],
    },
    "visa_explanation_letter": {
        "recommended_style": "embassy_safe",
        "length_guidance": "Short; plain and factual.",
        "best_for": "Embassy/visa submissions.",
        "description": "An embassy-safe, factual explanation letter.",
        "quality_rules": [
            "Plain, direct, factual, and non-emotional.",
            "State facts only; never exaggerate or speculate.",
        ],
    },
    "other": {
        "recommended_style": "formal",
        "length_guidance": "Keep it concise and professional.",
        "best_for": "General professional documents.",
        "description": "A professional document.",
        "quality_rules": ["Professional, specific, and concise."],
    },
}


def get_document_preset(document_type: str) -> dict:
    return DOCUMENT_TYPE_PRESETS.get(document_type, DOCUMENT_TYPE_PRESETS["other"])


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
# Friendly "best for" lines + lightweight mini-preview hints for the UI cards.
# ``preview`` is presentational metadata only (no graphics in the actual export).
_TEMPLATE_BEST_FOR = {
    "ats_classic": "Online job portals — maximum ATS safety.",
    "ats_modern": "Modern professional resumes that still parse cleanly.",
    "academic_cv": "Academic and university/research applications.",
    "scholarship_cv": "Scholarship committees (human review).",
    "formal_letter": "Embassies, universities, and official submissions.",
    "premium_letter": "Human review and direct sharing.",
}
_TEMPLATE_PREVIEW = {
    "ats_classic": {"columns": 1, "header": "plain", "divider": False, "tone": "compact"},
    "ats_modern": {"columns": 1, "header": "plain", "divider": True, "tone": "spacious"},
    "academic_cv": {"columns": 1, "header": "name", "divider": True, "tone": "academic"},
    "scholarship_cv": {"columns": 1, "header": "name", "divider": True, "tone": "refined"},
    "formal_letter": {"columns": 1, "header": "sender_block", "divider": False, "tone": "official"},
    "premium_letter": {"columns": 1, "header": "letterhead", "divider": True, "tone": "premium"},
}

for _t in TEMPLATES:
    _t["best_for"] = _TEMPLATE_BEST_FOR.get(_t["key"], "")
    _t["preview"] = _TEMPLATE_PREVIEW.get(_t["key"], {})

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
    document_types = []
    for key, meta in DOCUMENT_TYPES.items():
        preset = get_document_preset(key)
        document_types.append({
            "key": key,
            "label": meta["label"],
            "kind": meta["kind"],
            "credit_cost": meta["credit_cost"],
            "ats_relevant": meta["ats_relevant"],
            "recommended_template": recommend_template(key),
            "recommended_style": preset["recommended_style"],
            "length_guidance": preset["length_guidance"],
            "best_for": preset["best_for"],
            "description": preset["description"],
            "export_formats": _export_formats_for_type(key),
        })
    return {
        "content_styles": CONTENT_STYLES,
        "document_types": document_types,
        "templates": TEMPLATES,
    }


def _export_formats_for_type(document_type: str) -> list[str]:
    """Union of export formats across the templates that support this type."""
    formats: list[str] = []
    for t in templates_for_document_type(document_type):
        for f in t["export_formats"]:
            if f not in formats:
                formats.append(f)
    return formats


# ---- ATS validation (deterministic; no AI) ---------------------------------

ATS_HEADINGS = [
    "Summary", "Education", "Experience", "Projects", "Skills",
    "Certifications", "Awards", "Leadership", "Languages", "Publications",
]


# Generic filler phrases the content-quality check flags (Phase 1).
_GENERIC_PHRASES = (
    "i am passionate about", "i believe i am a good fit", "throughout my journey",
    "i am writing to express my interest", "i am writing to apply",
    "it has always been my dream", "i am a hard worker", "team player",
)


def _w(type_, severity, message) -> dict:
    return {"type": type_, "severity": severity, "message": message}


def validate_ats_structure(structured_content: dict, template_key: str) -> dict:
    """
    Deterministic ATS check for a generated CV/resume structure.

    Returns ``{ats_safe, score, warnings:[{type, severity, message}]}``. Score
    starts at 100 and drops per issue. Non-CV content returns a clean result.
    """
    content = structured_content if isinstance(structured_content, dict) else {}
    warnings: list[dict] = []
    score = 100

    template = _TEMPLATE_BY_KEY.get(template_key)
    template_ats_safe = bool(template and template["ats_safe"])
    if not template_ats_safe:
        warnings.append(_w("non_ats_template", "high",
                           "Avoid visual templates for online job portals — choose an ATS-safe template."))
        score -= 20

    def _has(section: str) -> bool:
        value = content.get(section)
        return bool(value) and (not isinstance(value, (list, str)) or len(value) > 0)

    if not _has("summary"):
        warnings.append(_w("missing_summary", "low",
                           "Add a Summary section for ATS compatibility."))
        score -= 10
    if not _has("education"):
        warnings.append(_w("missing_education", "high", "Missing Education section."))
        score -= 15
    if not (_has("experience") or _has("projects")):
        warnings.append(_w("missing_experience", "high",
                           "Add an Experience or Projects section."))
        score -= 15
    if not _has("skills"):
        warnings.append(_w("missing_skills", "medium",
                           "Add a Skills section — ATS systems scan for skill keywords."))
        score -= 10

    # Contact info present (and not only implied) — ATS needs parseable contact.
    header = content.get("header") if isinstance(content.get("header"), dict) else {}
    if not (str(header.get("email", "")).strip() or str(header.get("phone", "")).strip()):
        warnings.append(_w("missing_contact", "medium",
                           "Add an email or phone number to the header."))
        score -= 5

    # Measurable achievements heuristic: a digit somewhere in experience bullets.
    experience = content.get("experience") or []
    has_metric = any(any(ch.isdigit() for ch in str(item)) for item in experience) \
        if isinstance(experience, list) else False
    if experience and not has_metric:
        warnings.append(_w("missing_metrics", "medium",
                           "Add measurable outcomes (numbers, %, results) to make experience stronger."))
        score -= 5

    # Over-long bullets parse poorly.
    long_bullets = sum(
        1 for item in (experience if isinstance(experience, list) else []) if len(str(item)) > 350
    )
    if long_bullets:
        warnings.append(_w("long_bullets", "low",
                           "Some bullets are long — keep them to one or two lines for ATS parsing."))

    score = max(0, min(100, score))
    return {
        "ats_safe": template_ats_safe and not any(
            wn["severity"] == "high" for wn in warnings
        ),
        "score": score,
        "warnings": warnings,
    }


def _text_blob(content: dict) -> str:
    parts = []
    for v in (content or {}).values():
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, list):
            parts.extend(str(x) for x in v)
        elif isinstance(v, dict):
            parts.append(_text_blob(v))
    return " ".join(parts).lower()


def build_content_quality_warnings(content: dict, *, document_type: str,
                                   context: dict | None = None,
                                   target_organization: str = "") -> list[dict]:
    """
    Deterministic content-quality checks (no AI) → structured warnings. Flags
    generic filler, missing metrics, a weak profile, and missing target/context
    so the user can strengthen the document before exporting.
    """
    content = content if isinstance(content, dict) else {}
    context = context if isinstance(context, dict) else {}
    warnings: list[dict] = []
    blob = _text_blob(content)

    found_generic = [p for p in _GENERIC_PHRASES if p in blob]
    if found_generic:
        warnings.append(_w("generic_language", "medium",
                           "Replace generic phrasing with specific, concrete statements."))

    profile = context.get("profile") or {}
    if document_type in ("cover_letter", "motivation_letter", "statement_of_purpose"):
        if not (str(target_organization).strip()):
            warnings.append(_w("missing_target_organization", "medium",
                               "Add the target organization to tailor this letter."))
        if not (context.get("application")):
            warnings.append(_w("missing_application_context", "low",
                               "Link an application or pack so the letter is tailored to it."))

    if is_cv_type(document_type):
        weak = (
            not (profile.get("work") or content.get("experience"))
            and not (profile.get("education") or content.get("education"))
        )
        if weak:
            warnings.append(_w("weak_profile", "high",
                               "Your Smart Profile is thin — add education/work to strengthen this document."))

    return warnings


def compute_quality_score(content: dict, warnings: list[dict]) -> int:
    """Deterministic 0–100 quality score from the warning severities."""
    score = 100
    weights = {"high": 18, "medium": 9, "low": 4}
    for wn in warnings or []:
        score -= weights.get(wn.get("severity"), 5)
    return max(0, min(100, score))
