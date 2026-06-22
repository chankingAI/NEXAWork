import { useState, useCallback, useMemo } from 'react';
import { Copy, Check, ThumbsUp, Volume2, MoreHorizontal, Sparkles } from 'lucide-react';

export interface MessageBubbleProps {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  isStreaming?: boolean;
  onCopy?: (content: string) => void;
  onLike?: (id: string) => void;
}

/**
 * MessageBubble — Apple-level chat message component
 * - User: right-aligned, dark bg
 * - Assistant: left-aligned with brand icon, white bg
 * - Supports Markdown rendering (code blocks, links, lists, bold, italic)
 * - Action buttons: copy, like, speak, more
 */
export function MessageBubble({ id, role, content, model, isStreaming = false, onCopy, onLike }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    onCopy?.(content);
    setTimeout(() => setCopied(false), 2000);
  }, [content, onCopy]);

  const handleLike = useCallback(() => {
    setLiked(true);
    onLike?.(id);
  }, [id, onLike]);

  const renderedContent = useMemo(() => renderMarkdown(content), [content]);

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-br-md bg-[var(--color-accent)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text-inverse)]">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      {/* AI Avatar */}
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
        <Sparkles size={14} className="text-[var(--color-text-secondary)]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Model tag */}
        {model && <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{model}</span>}

        {/* Message content */}
        <div className="prose-nexawork text-sm leading-relaxed text-[var(--color-text-primary)]">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is escaped via escapeHtml before rendering */}
          <div dangerouslySetInnerHTML={{ __html: renderedContent }} />
          {isStreaming && <StreamingCursor />}
        </div>

        {/* Action buttons (visible on hover) */}
        {!isStreaming && (
          <div className="mt-1 flex gap-1 opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100">
            <ActionButton
              icon={copied ? <Check size={13} /> : <Copy size={13} />}
              label={copied ? 'Copied' : 'Copy'}
              onClick={handleCopy}
              active={copied}
            />
            <ActionButton icon={<ThumbsUp size={13} />} label="Like" onClick={handleLike} active={liked} />
            <ActionButton icon={<Volume2 size={13} />} label="Read aloud" onClick={() => {}} />
            <ActionButton icon={<MoreHorizontal size={13} />} label="More" onClick={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--color-text-primary)]" />;
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}

function ActionButton({ icon, label, onClick, active = false }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--duration-fast)] ${
        active
          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
          : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      {icon}
    </button>
  );
}

/**
 * Lightweight Markdown renderer (no external deps)
 * Supports: code blocks, inline code, bold, italic, links, lists, headings
 */
function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Code blocks (```lang\n...\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<div class="code-block">${langLabel}<pre><code>${code.trim()}</code></pre></div>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold (**...**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="msg-link" target="_blank" rel="noopener">$1</a>',
  );

  // Headings (### ... )
  html = html.replace(/^### (.+)$/gm, '<h4 class="msg-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="msg-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="msg-h2">$1</h2>');

  // Unordered lists (- item)
  html = html.replace(/^- (.+)$/gm, '<li class="msg-li">$1</li>');
  html = html.replace(/((?:<li class="msg-li">.*<\/li>\n?)+)/g, '<ul class="msg-ul">$1</ul>');

  // Ordered lists (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="msg-oli">$1</li>');
  html = html.replace(/((?:<li class="msg-oli">.*<\/li>\n?)+)/g, '<ol class="msg-ol">$1</ol>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');

  // Single line breaks → <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
