import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ChatViewProps {
  sessionId: string;
}

export function ChatView({ sessionId }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call IPC if available, otherwise mock
      if (window.nexawork) {
        const response = await window.nexawork.chat.send({
          sessionId,
          message: trimmed,
        });
        const assistantMessage: Message = {
          id: response.messageId,
          role: 'assistant',
          content: response.content,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Dev mode fallback
        const assistantMessage: Message = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: `NexaWork received: "${trimmed}". Backend integration pending (Prompt N4).`,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[var(--color-text-tertiary)]">Start a conversation...</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 focus-within:border-[var(--color-border-focus)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={isLoading ? undefined : handleSend}
            disabled={!input.trim() && !isLoading}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all duration-[var(--duration-fast)] ${
              input.trim() || isLoading
                ? 'bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
            }`}
            aria-label={isLoading ? 'Stop' : 'Send'}
          >
            {isLoading ? <Square size={12} /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
