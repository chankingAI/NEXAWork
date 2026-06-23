import { useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import type { ChatMessage, StreamEvent } from '../../shared/ipc-channels';

interface ChatViewProps {
  sessionId: string;
  /** Optional toolbar rendered in the input area (e.g. permission selector). */
  inputToolbar?: React.ReactNode;
}

/**
 * ChatView — Complete chat interface with streaming support
 * - Message list (user right-aligned, AI left-aligned)
 * - Streaming output with cursor animation
 * - Auto-scroll to bottom
 * - "Completed" status indicator
 * - Reference links section
 */
export function ChatView({ sessionId, inputToolbar }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Cleanup stream listener on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
      }
    };
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => [...prev, userMessage]);
      setIsLoading(true);
      setIsStreaming(true);
      setStreamingContent('');
      setCompletedAt(null);

      try {
        if (window.nexawork) {
          // Set up stream listener
          const unsubscribe = window.nexawork.chat.onStreamEvent((event: StreamEvent) => {
            switch (event.type) {
              case 'token':
                setStreamingContent(prev => prev + event.data);
                break;
              case 'done': {
                setIsStreaming(false);
                setIsLoading(false);
                setStreamingContent(prev => {
                  if (prev) {
                    const assistantMsg: ChatMessage = {
                      id: event.data.messageId,
                      role: 'assistant',
                      content: prev,
                      createdAt: new Date().toISOString(),
                    };
                    setMessages(msgs => [...msgs, assistantMsg]);
                  }
                  return '';
                });
                setCompletedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
                break;
              }
              case 'error':
                setIsStreaming(false);
                setIsLoading(false);
                setStreamingContent('');
                const errorMsg: ChatMessage = {
                  id: `err-${Date.now()}`,
                  role: 'assistant',
                  content: `Error: ${event.data.message}`,
                  createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, errorMsg]);
                break;
            }
          });
          streamCleanupRef.current = unsubscribe;

          // Trigger stream
          await window.nexawork.chat.stream({ sessionId, message });
        } else {
          // Dev mode fallback: simulate streaming
          await simulateStream(message, token => {
            setStreamingContent(prev => prev + token);
          });

          setIsStreaming(false);
          setIsLoading(false);
          setStreamingContent(prev => {
            if (prev) {
              const assistantMsg: ChatMessage = {
                id: `msg-${Date.now()}-ai`,
                role: 'assistant',
                content: prev,
                createdAt: new Date().toISOString(),
              };
              setMessages(msgs => [...msgs, assistantMsg]);
            }
            return '';
          });
          setCompletedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingContent('');
      }
    },
    [sessionId],
  );

  const handleStop = useCallback(() => {
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }
    if (window.nexawork) {
      window.nexawork.chat.stop({ sessionId });
    }
    // Finalize streaming content as message
    setStreamingContent(prev => {
      if (prev) {
        const partialMsg: ChatMessage = {
          id: `msg-${Date.now()}-partial`,
          role: 'assistant',
          content: prev + '\n\n*(generation stopped)*',
          createdAt: new Date().toISOString(),
        };
        setMessages(msgs => [...msgs, partialMsg]);
      }
      return '';
    });
    setIsStreaming(false);
    setIsLoading(false);
  }, [sessionId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !isStreaming && <EmptyState />}

        {messages.map(msg => (
          <MessageBubble key={msg.id} id={msg.id} role={msg.role} content={msg.content} model={msg.model} />
        ))}

        {/* Streaming message in progress */}
        {isStreaming && streamingContent && (
          <MessageBubble id="streaming" role="assistant" content={streamingContent} isStreaming={true} />
        )}

        {/* Loading dots (before first token arrives) */}
        {isLoading && !streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-text-tertiary)] border-t-transparent" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:100ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-tertiary)] [animation-delay:200ms]" />
            </div>
          </div>
        )}

        {/* Completed status */}
        {completedAt && !isStreaming && messages.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-quaternary)]">
            <CheckCircle2 size={12} className="text-[var(--color-success)]" />
            <span>已完成 · {completedAt}</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <ChatInput onSend={handleSend} onStop={handleStop} isLoading={isLoading} toolbar={inputToolbar} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-bg-tertiary)]">
        <span className="text-2xl">✨</span>
      </div>
      <div className="text-center">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">NexaWork AI</h3>
        <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">输入你的需求，让 AI 帮你完成工作</p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {quickActions.map(action => (
          <QuickActionChip key={action.label} label={action.label} />
        ))}
      </div>
    </div>
  );
}

const quickActions = [
  { label: '编写代码' },
  { label: '分析数据' },
  { label: '生成文档' },
  { label: '翻译内容' },
  { label: '自动化任务' },
];

function QuickActionChip({ label }: { label: string }) {
  return (
    <span className="cursor-pointer rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-focus)] hover:text-[var(--color-text-primary)]">
      {label}
    </span>
  );
}

/**
 * Dev mode: simulate streaming response
 */
async function simulateStream(message: string, onToken: (token: string) => void): Promise<void> {
  const response = `收到你的消息："${message}"

我是 **NexaWork AI** 助手，正在流式输出模式下运行。

### 功能演示

- ✅ Markdown 渲染
- ✅ 代码高亮
- ✅ 流式输出动画
- ✅ 消息操作按钮

\`\`\`typescript
const greeting = "Hello from NexaWork!";
console.log(greeting);
\`\`\`

如需更多帮助，请随时提问。`;

  const tokens = response.split('');
  for (const token of tokens) {
    await new Promise(resolve => setTimeout(resolve, 15));
    onToken(token);
  }
}
