"use client";
import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import "highlight.js/styles/github-dark.css";

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

export function Markdown({ children, streaming }: { children: string; streaming?: boolean }) {
  return (
    <div className={`md break-words ${streaming ? "cursor" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          img: ({ src, alt }) => {
            const isBase64 = src?.startsWith("data:image/");
            return (
              <span className="block my-3">
                <img
                  src={src}
                  alt={alt || "Image"}
                  className={`rounded-2xl border border-line shadow-xl object-contain transition-transform duration-200 hover:scale-[1.01] ${isBase64 ? "max-h-[260px] w-auto" : "max-h-[520px] w-auto"}`}
                  loading="lazy"
                />
                {alt && <span className="block mt-1.5 text-xs text-muted italic">{alt}</span>}
              </span>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
