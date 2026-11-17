import csv
import io
import json

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"}


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _sections(text: str, size: int = 3000, label: str = "Section") -> list[tuple[str, str]]:
    """Group lines into ~size-char sections so each has a stable location label."""
    out: list[tuple[str, str]] = []
    buf: list[str] = []
    n = 0
    for line in text.splitlines():
        buf.append(line)
        n += len(line) + 1
        if n >= size:
            out.append((f"{label} {len(out) + 1}", "\n".join(buf)))
            buf, n = [], 0
    if any(l.strip() for l in buf):
        out.append((f"{label} {len(out) + 1}", "\n".join(buf)))
    return out


def parse_file(filename: str, data: bytes) -> list[tuple[str, str]]:
    """Returns [(location_label, text)]."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("Password-protected PDFs are not supported.")
        pages = []
        for i, page in enumerate(reader.pages, 1):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append((f"Page {i}", text))
        if not pages:
            raise ValueError("No selectable text found. Scanned PDFs need OCR first.")
        return pages
    if ext == ".docx":
        from docx import Document

        doc = Document(io.BytesIO(data))
        lines = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                lines.append(" | ".join(c.text.strip() for c in row.cells))
        return _sections("\n".join(lines))
    if ext == ".csv":
        text = _decode(data)
        rows = list(csv.reader(io.StringIO(text)))
        if not rows:
            raise ValueError("The CSV file is empty.")
        header, body = rows[0], rows[1:]
        out = []
        step = 40
        for start in range(0, max(len(body), 1), step):
            block = body[start : start + step]
            lines = [" | ".join(header)] + [" | ".join(r) for r in block]
            out.append((f"Rows {start + 1}-{start + len(block)}", "\n".join(lines)))
        return out
    if ext == ".json":
        text = _decode(data)
        try:
            text = json.dumps(json.loads(text), indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            pass
        return _sections(text)
    if ext == ".txt":
        return _sections(_decode(data))
    if ext in {".png", ".jpg", ".jpeg", ".webp"}:
        from PIL import Image

        try:
            img = Image.open(io.BytesIO(data))
            text = ""
            try:
                import pytesseract
                text = pytesseract.image_to_string(img).strip()
            except Exception:
                pass
            summary = f"Image file '{filename}' ({img.format}, {img.size[0]}x{img.size[1]}px, mode {img.mode})."
            if text:
                summary += f"\n\nExtracted Text (OCR):\n{text}"
            else:
                summary += "\n\n(Visual image uploaded: ready for image discussion)."
            return [("Image Analysis", summary)]
        except Exception as e:
            raise ValueError(f"Could not read image file: {e}")
    raise ValueError("Unsupported file type. Upload PDF, DOCX, TXT, CSV, JSON, PNG, JPG or WEBP.")
