"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content, className }: { content: string; className?: string }) {
  if (!content?.trim()) return null;
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
