import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, AtSign } from 'lucide-react';

export interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Optional toolbar rendered below the input (e.g. permission selector). */
  toolbar?: React.ReactNode;
}

/**
 * ChatInput — Apple-level multi-line input with streaming control
 * - Shift+Enter: new line
 * - Enter: send message
 * - @ mention trigger
 * - Auto-resize textarea
 * - Send button (black circle, bottom-right)
 */
export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  placeholder = '今天帮你做些什么？',
  disabled = false,
  toolbar,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showMention, setShowMention] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${newHeight}px`;
  }, [input]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setInput('');
    setShowMention(false);
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isLoading, disabled, onSend]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value);

      // Detect @ mention
      const lastChar = value.slice(-1);
      if (lastChar === '@') {
        setShowMention(true);
      } else if (showMention && (lastChar === ' ' || value.length === 0)) {
        setShowMention(false);
      }
    },
    [showMention],
  );

  const hasContent = input.trim().length > 0;

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* @mention popup */}
        {showMention && (
          <MentionPopup
            onSelect={item => {
              setInput(prev => prev + item + ' ');
              setShowMention(false);
              textareaRef.current?.focus();
            }}
          />
        )}

        {/* Input container */}
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 shadow-sm transition-shadow duration-[var(--duration-fast)] focus-within:border-[var(--color-border-focus)] focus-within:shadow-md">
          {/* Attachment button */}
          <button
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-normal text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />

          {/* @ button */}
          <button
            onClick={() => {
              setInput(prev => prev + '@');
              setShowMention(true);
              textareaRef.current?.focus();
            }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
            title="Mention file or context"
          >
            <AtSign size={16} />
          </button>

          {/* Send / Stop button */}
          <button
            onClick={isLoading ? handleStop : handleSend}
            disabled={!hasContent && !isLoading}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-[var(--duration-fast)] ${
              isLoading
                ? 'bg-[var(--color-error)] text-white'
                : hasContent
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)] shadow-sm'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={isLoading ? 'Stop generation' : 'Send message'}
          >
            {isLoading ? <Square size={12} /> : <Send size={14} className="-translate-x-[1px]" />}
          </button>
        </div>

        {/* Toolbar (permission selector, etc.) */}
        {toolbar && (
          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">{toolbar}</div>
          </div>
        )}

        {/* Footer hint */}
        <p className="mt-1.5 text-center text-[11px] text-[var(--color-text-quaternary)]">
          Shift+Enter 换行 · Enter 发送 · @引用文件
        </p>
      </div>
    </div>
  );
}

interface MentionPopupProps {
  onSelect: (item: string) => void;
}

function MentionPopup({ onSelect }: MentionPopupProps) {
  const items = [
    { label: '当前文件', value: 'currentFile' },
    { label: '工作区', value: 'workspace' },
    { label: '终端', value: 'terminal' },
    { label: '剪贴板', value: 'clipboard' },
  ];

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg">
      <div className="px-3 py-2 text-[11px] font-medium text-[var(--color-text-tertiary)]">引用上下文</div>
      {items.map(item => (
        <button
          key={item.value}
          onClick={() => onSelect(item.value)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-secondary)]"
        >
          <AtSign size={14} className="text-[var(--color-text-tertiary)]" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
