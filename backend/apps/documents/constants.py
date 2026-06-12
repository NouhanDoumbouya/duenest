"""Upload rules for document files.

Kept in one place so the model, serializer, and docs stay in sync.
"""

# Maximum upload size: 10 MB.
MAX_FILE_SIZE = 10 * 1024 * 1024

# Allowed MIME types (as reported by the client — see TODO below).
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Allowed file extensions (lowercased, with the leading dot).
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}

# Types that can be previewed inline in the browser. DOC/DOCX are downloadable
# but not previewable yet.
PREVIEWABLE_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
PREVIEWABLE_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}

# TODO(security): the client-supplied content type is spoofable. A future
# hardening pass should sniff the real type from the file's magic bytes
# (e.g. python-magic) and run an antivirus scan (e.g. ClamAV) before the file
# is considered trusted.
