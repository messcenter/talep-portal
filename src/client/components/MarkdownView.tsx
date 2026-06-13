import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="md-view">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
