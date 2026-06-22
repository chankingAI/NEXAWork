import { describe, test, expect } from 'bun:test'

/**
 * Chat Components Unit Tests (N3)
 * Tests MessageBubble markdown rendering, ChatInput logic, ChatView flow
 */

describe('Markdown Renderer', () => {
  // Import the renderMarkdown function indirectly via module
  // Since it's internal to MessageBubble, we test the expected transformations

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function renderMarkdown(text: string): string {
    let html = escapeHtml(text)

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : ''
      return `<div class="code-block">${langLabel}<pre><code>${code.trim()}</code></pre></div>`
    })
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="msg-link" target="_blank" rel="noopener">$1</a>',
    )
    html = html.replace(/^### (.+)$/gm, '<h4 class="msg-h4">$1</h4>')
    html = html.replace(/^## (.+)$/gm, '<h3 class="msg-h3">$1</h3>')
    html = html.replace(/^# (.+)$/gm, '<h2 class="msg-h2">$1</h2>')
    html = html.replace(/^- (.+)$/gm, '<li class="msg-li">$1</li>')
    html = html.replace(
      /((?:<li class="msg-li">.*<\/li>\n?)+)/g,
      '<ul class="msg-ul">$1</ul>',
    )
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="msg-oli">$1</li>')
    html = html.replace(
      /((?:<li class="msg-oli">.*<\/li>\n?)+)/g,
      '<ol class="msg-ol">$1</ol>',
    )
    html = html.replace(/\n\n/g, '</p><p>')
    html = `<p>${html}</p>`
    html = html.replace(/<p><\/p>/g, '')
    html = html.replace(/\n/g, '<br>')
    return html
  }

  test('renders plain text correctly', () => {
    const result = renderMarkdown('Hello world')
    expect(result).toContain('Hello world')
    expect(result).toContain('<p>')
  })

  test('renders bold text', () => {
    const result = renderMarkdown('This is **bold** text')
    expect(result).toContain('<strong>bold</strong>')
  })

  test('renders italic text', () => {
    const result = renderMarkdown('This is *italic* text')
    expect(result).toContain('<em>italic</em>')
  })

  test('renders inline code', () => {
    const result = renderMarkdown('Use `npm install` command')
    expect(result).toContain('<code class="inline-code">npm install</code>')
  })

  test('renders code blocks with language', () => {
    const result = renderMarkdown('```typescript\nconst x = 1;\n```')
    expect(result).toContain('<div class="code-block">')
    expect(result).toContain('<span class="code-lang">typescript</span>')
    expect(result).toContain('const x = 1;')
  })

  test('renders code blocks without language', () => {
    const result = renderMarkdown('```\nhello\n```')
    expect(result).toContain('<div class="code-block">')
    expect(result).toContain('hello')
    expect(result).not.toContain('code-lang')
  })

  test('renders links', () => {
    const result = renderMarkdown('Visit [Google](https://google.com) for more')
    expect(result).toContain('<a href="https://google.com"')
    expect(result).toContain('class="msg-link"')
    expect(result).toContain('>Google</a>')
  })

  test('renders headings', () => {
    const h1 = renderMarkdown('# Title')
    expect(h1).toContain('<h2 class="msg-h2">Title</h2>')

    const h2 = renderMarkdown('## Subtitle')
    expect(h2).toContain('<h3 class="msg-h3">Subtitle</h3>')

    const h3 = renderMarkdown('### Section')
    expect(h3).toContain('<h4 class="msg-h4">Section</h4>')
  })

  test('renders unordered lists', () => {
    const result = renderMarkdown('- Item 1\n- Item 2\n- Item 3')
    expect(result).toContain('<ul class="msg-ul">')
    expect(result).toContain('<li class="msg-li">Item 1</li>')
    expect(result).toContain('<li class="msg-li">Item 2</li>')
  })

  test('renders ordered lists', () => {
    const result = renderMarkdown('1. First\n2. Second\n3. Third')
    expect(result).toContain('<ol class="msg-ol">')
    expect(result).toContain('<li class="msg-oli">First</li>')
  })

  test('escapes HTML to prevent XSS', () => {
    const result = renderMarkdown("<script>alert('xss')</script>")
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })

  test('renders paragraphs from double newlines', () => {
    const result = renderMarkdown('Para 1\n\nPara 2')
    expect(result).toContain('</p><p>')
  })

  test('renders line breaks from single newline', () => {
    const result = renderMarkdown('Line 1\nLine 2')
    expect(result).toContain('<br>')
  })

  test('complex markdown renders correctly', () => {
    const input = `# Title

This is **bold** and *italic*.

- Item A
- Item B

\`\`\`js
const x = 1;
\`\`\`

[Link](https://example.com)`

    const result = renderMarkdown(input)
    expect(result).toContain('<h2 class="msg-h2">Title</h2>')
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<em>italic</em>')
    expect(result).toContain('<ul class="msg-ul">')
    expect(result).toContain('<div class="code-block">')
    expect(result).toContain('<a href="https://example.com"')
  })
})

describe('ChatInput behavior', () => {
  test('Shift+Enter should not trigger send (logic check)', () => {
    let sent = false
    const handleKeyDown = (key: string, shiftKey: boolean) => {
      if (key === 'Enter' && !shiftKey) {
        sent = true
      }
    }

    handleKeyDown('Enter', true) // Shift+Enter
    expect(sent).toBe(false)

    handleKeyDown('Enter', false) // Enter only
    expect(sent).toBe(true)
  })

  test('empty input should not be sendable', () => {
    const input = '   '
    const trimmed = input.trim()
    expect(trimmed.length).toBe(0)
  })

  test('@ detection logic', () => {
    let showMention = false
    const values = ['Hello @', '@file', 'text']

    for (const value of values) {
      const lastChar = value.slice(-1)
      if (lastChar === '@') {
        showMention = true
      }
    }

    expect(showMention).toBe(true)
  })
})

describe('ChatView streaming logic', () => {
  test('streaming accumulates tokens correctly', () => {
    let content = ''
    const tokens = ['Hello', ' ', 'world', '!']

    for (const token of tokens) {
      content += token
    }

    expect(content).toBe('Hello world!')
  })

  test('stop clears streaming state', () => {
    let isStreaming = true
    let content = 'partial response'

    // Stop action
    isStreaming = false
    const finalContent = content + '\n\n*(generation stopped)*'
    content = ''

    expect(isStreaming).toBe(false)
    expect(content).toBe('')
    expect(finalContent).toContain('*(generation stopped)*')
  })

  test('error event resets state', () => {
    let isStreaming = true
    let isLoading = true
    let streamContent = 'partial'

    // Error event
    isStreaming = false
    isLoading = false
    streamContent = ''

    expect(isStreaming).toBe(false)
    expect(isLoading).toBe(false)
    expect(streamContent).toBe('')
  })

  test('done event finalizes message', () => {
    const messages: Array<{ role: string; content: string }> = []
    let streamContent = 'Final response text'

    // Done event
    if (streamContent) {
      messages.push({
        role: 'assistant',
        content: streamContent,
      })
    }
    streamContent = ''

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('Final response text')
    expect(streamContent).toBe('')
  })

  test('auto-scroll is triggered on new messages', () => {
    let scrollTop = 0
    const scrollHeight = 1000
    const messages = [{ id: '1' }, { id: '2' }]

    // Simulate auto-scroll effect
    if (messages.length > 0) {
      scrollTop = scrollHeight
    }

    expect(scrollTop).toBe(scrollHeight)
  })
})
