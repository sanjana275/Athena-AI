"use client";
import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { Check, Copy, Download } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function langOf(node: ReactNode): string {
  if (isValidElement(node)) {
    const m = /language-(\w+)/.exec((node.props as { className?: string }).className || "");
    if (m) return m[1];
  }
  return "code";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-[#0d1117]">
      <div className="flex items-center justify-between bg-white/5 px-4 py-1.5 text-xs text-gray-400">
        <span>{langOf(children)}</span>
        <button
          className="inline-flex items-center gap-1 hover:text-white"
          onClick={async () => {
            await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ""));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function ImageRenderer({ src, alt }: { src?: string; alt?: string }) {
  const [downloading, setDownloading] = useState(false);
  const isBase64 = src?.startsWith("data:image/");
  const isGenerated = src?.includes("image.pollinations.ai") || (!isBase64 && src?.startsWith("http"));

  const handleDownload = async () => {
    if (!src) return;
    try {
      setDownloading(true);
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(alt || "athena-generated-image").replace(/[^\w-]/g, "_")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <span className="block my-3">
      <img
        src={src}
        alt={alt || "Image"}
        className={`rounded-2xl border border-line shadow-xl object-contain transition-transform duration-200 hover:scale-[1.01] ${
          isBase64 ? "max-h-[260px] w-auto" : "max-h-[520px] w-auto"
        }`}
        loading="lazy"
      />
      <span className="flex items-center justify-between gap-3 mt-2 text-xs">
        {alt && <span className="text-muted italic truncate">{alt}</span>}
        {isGenerated && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-line bg-panel hover:bg-raised text-fg font-medium transition shadow-sm text-xs shrink-0"
            title="Download full-resolution image"
          >
            <Download size={13} />
            <span>{downloading ? "Downloading…" : "Download Image"}</span>
          </button>
        )}
      </span>
    </span>
  );
}

function preprocessMath(content: string): string {
  if (!content) return "";
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => `$$\n${eq.trim()}\n$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => `$${eq.trim()}$`);
}

export function Markdown({ children, streaming }: { children: string; streaming?: boolean }) {
  const processed = preprocessMath(children);
  return (
    <div className={`md break-words ${streaming ? "cursor" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          [rehypeKatex, { throwOnError: false }],
        ]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => {
            if (href === "action:retry-image") {
              return (
                <button
                  type="button"
                  onClick={() => {
                    const btn = document.querySelector('button[title="Regenerate"]') as HTMLButtonElement;
                    if (btn) btn.click();
                  }}
                  className="inline-flex items-center gap-1 text-accent hover:underline font-medium cursor-pointer"
                >
                  {children}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          img: ({ src, alt }) => <ImageRenderer src={src} alt={alt} />,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
