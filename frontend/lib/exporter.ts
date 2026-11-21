import { API, getAuthToken } from "./api";

/**
 * Clean markdown-to-HTML formatter producing publication-grade HTML documents.
 */
function formatMarkdownToCleanHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inTable = false;
  let tableHeaderDone = false;

  const closeList = () => {
    if (inList) {
      output.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  };

  const closeTable = () => {
    if (inTable) {
      output.push("</tbody></table>");
      inTable = false;
      tableHeaderDone = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle
    if (trimmed.startsWith("```")) {
      closeList();
      closeTable();
      if (inCodeBlock) {
        output.push(
          `<pre class="code-block"><code>${codeBuffer
            .join("\n")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</code></pre>`
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Markdown Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeList();
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      // Check if this is separator line |---|---|
      const isSep = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSep) {
        tableHeaderDone = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderDone = false;
        output.push('<table class="doc-table"><thead><tr>');
        cells.forEach((c) => output.push(`<th>${inlineFormat(c)}</th>`));
        output.push("</tr></thead><tbody>");
      } else {
        output.push("<tr>");
        cells.forEach((c) => output.push(`<td>${inlineFormat(c)}</td>`));
        output.push("</tr>");
      }
      continue;
    } else {
      closeTable();
    }

    // Unordered list item
    if (/^[\*\-]\s+(.*)$/.test(trimmed)) {
      const match = trimmed.match(/^[\*\-]\s+(.*)$/);
      if (inList !== "ul") {
        closeList();
        inList = "ul";
        output.push("<ul>");
      }
      output.push(`<li>${inlineFormat(match ? match[1] : "")}</li>`);
      continue;
    }

    // Ordered list item
    if (/^\d+\.\s+(.*)$/.test(trimmed)) {
      const match = trimmed.match(/^\d+\.\s+(.*)$/);
      if (inList !== "ol") {
        closeList();
        inList = "ol";
        output.push("<ol>");
      }
      output.push(`<li>${inlineFormat(match ? match[1] : "")}</li>`);
      continue;
    }

    // If not a list item, close any open list
    closeList();

    // Headings
    if (trimmed.startsWith("### ")) {
      output.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      output.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      output.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      output.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5em 0;" />');
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      output.push(`<blockquote>${inlineFormat(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Empty line
    if (!trimmed) {
      continue;
    }

    // Normal paragraph
    output.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  closeList();
  closeTable();
  return output.join("\n");
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4f46e5;text-decoration:none;">$1</a>');
}

export function exportToPdf(title: string, markdown: string) {
  if (typeof window === "undefined") return;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to export the PDF.");
    return;
  }

  const htmlContent = formatMarkdownToCleanHtml(markdown);
  const docTitle = title || "Athena AI Document";
  const docHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${docTitle}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 16mm 20mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            line-height: 1.65;
            margin: 0;
            padding: 24px;
            font-size: 11pt;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 24px;
          }
          .brand { font-size: 1.2rem; font-weight: 700; color: #0f172a; }
          .date { font-size: 0.85rem; color: #64748b; }
          h1 { font-size: 1.8rem; color: #0f172a; margin-top: 1.2em; margin-bottom: 0.4em; }
          h2 { font-size: 1.4rem; color: #0f172a; margin-top: 1.2em; margin-bottom: 0.4em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          h3 { font-size: 1.15rem; color: #1e293b; margin-top: 1.1em; margin-bottom: 0.3em; }
          p { margin: 0.7em 0; line-height: 1.65; }
          ul, ol { margin: 0.6em 0 0.8em 1.5em; padding: 0; }
          li { margin-bottom: 0.35em; line-height: 1.6; }
          .doc-table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 10pt; }
          .doc-table th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 600; text-align: left; }
          .doc-table td { border: 1px solid #cbd5e1; padding: 8px 12px; }
          .code-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 9pt; overflow-x: auto; page-break-inside: avoid; }
          .inline-code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
          blockquote { border-left: 4px solid #6366f1; padding-left: 12px; margin: 1em 0; color: #475569; font-style: italic; }
          .footer {
            margin-top: 40px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            font-size: 0.75rem;
            color: #94a3b8;
            text-align: center;
          }
          @media print {
            .header, .footer { position: relative; }
            h1, h2, h3, .doc-table, .code-block { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">Athena AI &bull; Document</div>
          <div class="date">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div class="content">${htmlContent}</div>
        <div class="footer">Generated by Athena AI &bull; ${new Date().toLocaleTimeString()}</div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(docHtml);
  printWindow.document.close();
}

/**
 * Downloads a genuine, native Microsoft PowerPoint (.pptx) presentation.
 * Uses python-pptx backend generator for 100% PowerPoint compatibility on Windows.
 */
export async function exportToPpt(title: string, markdown: string) {
  if (typeof window === "undefined") return;

  const safeTitle = (title || "Athena-Presentation")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .slice(0, 40) || "Athena_Presentation";

  try {
    const token = getAuthToken();
    const res = await fetch(`${API}/export/pptx`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ title: title || "Athena Presentation", markdown }),
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.pptx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    console.error("PPTX backend generation failed, falling back to local presentation viewer:", err);
    // Fallback: Open interactive browser slide deck
    openSlideViewer(title, markdown);
  }
}

/** Fallback presentation slide deck viewable and printable as slides in any browser. */
function openSlideViewer(title: string, markdown: string) {
  const win = window.open("", "_blank");
  if (!win) return;

  const rawSections = markdown.split(/\n(?=#{1,3}\s+|---\s*\n)/).filter(s => s.trim().length > 0);
  const sections = rawSections.length > 0 ? rawSections : [markdown];

  const slidesHtml = sections.map((sec, idx) => {
    const lines = sec.trim().split("\n");
    let slideTitle = `Slide ${idx + 1}`;
    const bodyLines: string[] = [];

    for (const l of lines) {
      if (l.startsWith("#")) {
        slideTitle = l.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
      } else if (l.trim() !== "---") {
        bodyLines.push(l);
      }
    }

    const bodyHtml = bodyLines
      .join("<br/>")
      .replace(/^[\*\-]\s*(.*$)/gim, "<li style='margin-bottom:8px;'>$1</li>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");

    return `
      <div class="slide">
        <div class="slide-header">
          <h2>${slideTitle}</h2>
          <span class="slide-num">${idx + 1} / ${sections.length}</span>
        </div>
        <div class="slide-body">
          ${bodyHtml || "<p>Key points and insights</p>"}
        </div>
        <div class="slide-footer">Athena AI &bull; Slide ${idx + 1}</div>
      </div>
    `;
  }).join("\n");

  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title || "Athena Presentation"}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: Calibri, -apple-system, sans-serif; background: #0f172a; margin: 0; padding: 24px; color: #1e293b; }
          .slide {
            page-break-after: always;
            width: 10in;
            min-height: 5.6in;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            margin: 24px auto;
            padding: 40px 48px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .slide-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #6366f1; padding-bottom: 12px; }
          h2 { margin: 0; color: #0f172a; font-size: 24pt; font-weight: 700; }
          .slide-num { font-size: 13pt; color: #64748b; font-weight: 600; }
          .slide-body { flex: 1; padding-top: 24px; font-size: 16pt; color: #334155; line-height: 1.6; }
          .slide-footer { font-size: 10pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        </style>
      </head>
      <body>
        ${slidesHtml}
      </body>
    </html>
  `;
  win.document.open();
  win.document.write(fullHtml);
  win.document.close();
}
