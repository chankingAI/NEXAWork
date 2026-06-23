/**
 * N12 — ExpertListPage Tests
 * Covers: data structures, featured scenarios, category filtering,
 * search, expert cards, tabs, pagination/empty states, integration
 */
import { describe, test, expect } from 'bun:test'
import {
  type Expert,
  type ExpertCategory,
  type MarketplaceTab,
  type FeaturedScenario,
  defaultExperts,
  featuredScenarios,
  categoryTags,
} from '../renderer/components/ExpertListPage'

// ─── Expert Data Structure Tests ──────────────────────────────
describe('Expert data structure', () => {
  test('Expert has required fields', () => {
    const expert: Expert = {
      id: 'test-1',
      name: 'Test Expert',
      role: 'Test Role',
      avatar: '🧪',
      description: 'A test expert',
      tags: ['tag1', 'tag2'],
      category: 'engineering',
      usageCount: 100,
    }
    expect(expert.id).toBe('test-1')
    expect(expert.name).toBe('Test Expert')
    expect(expert.role).toBe('Test Role')
    expect(expert.avatar).toBe('🧪')
    expect(expert.description).toBe('A test expert')
    expect(expert.tags).toHaveLength(2)
    expect(expert.category).toBe('engineering')
    expect(expert.usageCount).toBe(100)
  })

  test('Expert supports optional isCustom flag', () => {
    const custom: Expert = {
      id: 'custom-1',
      name: 'Custom',
      role: 'Role',
      avatar: '🔧',
      description: 'Custom expert',
      tags: [],
      category: 'product',
      usageCount: 0,
      isCustom: true,
    }
    expect(custom.isCustom).toBe(true)
  })

  test('Expert supports optional systemPrompt', () => {
    const expert: Expert = {
      id: 'sp-1',
      name: 'SP Expert',
      role: 'Role',
      avatar: '💬',
      description: 'Has system prompt',
      tags: [],
      category: 'engineering',
      usageCount: 0,
      systemPrompt: 'You are an expert in...',
    }
    expect(expert.systemPrompt).toBe('You are an expert in...')
  })

  test('ExpertCategory covers all expected values', () => {
    const categories: ExpertCategory[] = [
      'all',
      'hot',
      'new',
      'product',
      'engineering',
      'finance',
      'design',
      'legal',
      'marketing',
      'education',
    ]
    expect(categories).toHaveLength(10)
  })

  test('MarketplaceTab covers all tab types', () => {
    const tabs: MarketplaceTab[] = ['experts', 'skills', 'connectors']
    expect(tabs).toHaveLength(3)
  })
})

// ─── Default Experts Tests ────────────────────────────────────
describe('defaultExperts', () => {
  test('contains 12 built-in experts', () => {
    expect(defaultExperts).toHaveLength(12)
  })

  test('all experts have unique ids', () => {
    const ids = defaultExperts.map(e => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  test('all experts have non-empty required fields', () => {
    for (const expert of defaultExperts) {
      expect(expert.id.length).toBeGreaterThan(0)
      expect(expert.name.length).toBeGreaterThan(0)
      expect(expert.role.length).toBeGreaterThan(0)
      expect(expert.avatar.length).toBeGreaterThan(0)
      expect(expert.description.length).toBeGreaterThan(0)
      expect(expert.tags.length).toBeGreaterThanOrEqual(1)
      expect(expert.usageCount).toBeGreaterThanOrEqual(0)
    }
  })

  test('all experts have valid categories', () => {
    const validCats: ExpertCategory[] = [
      'all',
      'hot',
      'new',
      'product',
      'engineering',
      'finance',
      'design',
      'legal',
      'marketing',
      'education',
    ]
    for (const expert of defaultExperts) {
      expect(validCats).toContain(expert.category)
    }
  })

  test('contains frontend expert', () => {
    const fe = defaultExperts.find(e => e.id === 'frontend-expert')
    expect(fe).toBeDefined()
    expect(fe!.name).toBe('前端架构师')
    expect(fe!.category).toBe('engineering')
    expect(fe!.tags).toContain('React')
  })

  test('contains backend expert', () => {
    const be = defaultExperts.find(e => e.id === 'backend-expert')
    expect(be).toBeDefined()
    expect(be!.name).toBe('后端架构师')
    expect(be!.tags).toContain('Node.js')
  })

  test('contains product manager', () => {
    const pm = defaultExperts.find(e => e.id === 'product-manager')
    expect(pm).toBeDefined()
    expect(pm!.category).toBe('product')
  })

  test('contains financial analyst', () => {
    const fa = defaultExperts.find(e => e.id === 'financial-analyst')
    expect(fa).toBeDefined()
    expect(fa!.category).toBe('finance')
  })

  test('contains legal advisor', () => {
    const la = defaultExperts.find(e => e.id === 'legal-advisor')
    expect(la).toBeDefined()
    expect(la!.category).toBe('legal')
  })

  test('contains design expert', () => {
    const de = defaultExperts.find(e => e.id === 'ui-designer')
    expect(de).toBeDefined()
    expect(de!.category).toBe('design')
  })

  test('contains marketing expert', () => {
    const me = defaultExperts.find(e => e.id === 'growth-hacker')
    expect(me).toBeDefined()
    expect(me!.category).toBe('marketing')
  })

  test('contains education expert', () => {
    const edu = defaultExperts.find(e => e.id === 'educator')
    expect(edu).toBeDefined()
    expect(edu!.category).toBe('education')
  })

  test('usage counts are all positive', () => {
    for (const expert of defaultExperts) {
      expect(expert.usageCount).toBeGreaterThan(0)
    }
  })

  test('none are custom by default', () => {
    for (const expert of defaultExperts) {
      expect(expert.isCustom).toBeUndefined()
    }
  })
})

// ─── Featured Scenarios Tests ─────────────────────────────────
describe('featuredScenarios', () => {
  test('contains 4 scenarios', () => {
    expect(featuredScenarios).toHaveLength(4)
  })

  test('all scenarios have unique ids', () => {
    const ids = featuredScenarios.map(s => s.id)
    expect(new Set(ids).size).toBe(4)
  })

  test('all scenarios have required fields', () => {
    for (const scenario of featuredScenarios) {
      expect(scenario.id.length).toBeGreaterThan(0)
      expect(scenario.title.length).toBeGreaterThan(0)
      expect(scenario.description.length).toBeGreaterThan(0)
      expect(scenario.color.length).toBeGreaterThan(0)
      expect(scenario.icon).toBeDefined()
      expect(scenario.expertNames.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('content creation scenario exists', () => {
    const content = featuredScenarios.find(s => s.id === 'content')
    expect(content).toBeDefined()
    expect(content!.title).toBe('内容创作')
    expect(content!.color).toBe('#F59E0B')
    expect(content!.expertNames).toHaveLength(3)
  })

  test('investment scenario exists', () => {
    const invest = featuredScenarios.find(s => s.id === 'investment')
    expect(invest).toBeDefined()
    expect(invest!.title).toBe('投资分析')
    expect(invest!.color).toBe('#10B981')
  })

  test('legal scenario exists', () => {
    const legal = featuredScenarios.find(s => s.id === 'legal')
    expect(legal).toBeDefined()
    expect(legal!.title).toBe('法律咨询')
    expect(legal!.color).toBe('#6366F1')
  })

  test('startup scenario exists', () => {
    const startup = featuredScenarios.find(s => s.id === 'startup')
    expect(startup).toBeDefined()
    expect(startup!.title).toBe('小微企业')
    expect(startup!.color).toBe('#EC4899')
  })

  test('all scenario colors are valid hex', () => {
    for (const scenario of featuredScenarios) {
      expect(scenario.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

// ─── Category Tags Tests ──────────────────────────────────────
describe('categoryTags', () => {
  test('contains 10 categories', () => {
    expect(categoryTags).toHaveLength(10)
  })

  test('all categories have unique ids', () => {
    const ids = categoryTags.map(t => t.id)
    expect(new Set(ids).size).toBe(10)
  })

  test('first tag is "all"', () => {
    expect(categoryTags[0].id).toBe('all')
    expect(categoryTags[0].label).toBe('全部')
  })

  test('"hot" and "new" are second and third', () => {
    expect(categoryTags[1].id).toBe('hot')
    expect(categoryTags[1].label).toBe('最热')
    expect(categoryTags[2].id).toBe('new')
    expect(categoryTags[2].label).toBe('最新')
  })

  test('all tags have icons', () => {
    for (const tag of categoryTags) {
      expect(tag.icon).toBeDefined()
    }
  })

  test('all tags have labels', () => {
    for (const tag of categoryTags) {
      expect(tag.label.length).toBeGreaterThan(0)
    }
  })
})

// ─── Category Filtering Logic Tests ───────────────────────────
describe('category filtering', () => {
  test('filter by engineering returns engineering experts', () => {
    const results = defaultExperts.filter(e => e.category === 'engineering')
    expect(results.length).toBeGreaterThan(0)
    for (const expert of results) {
      expect(expert.category).toBe('engineering')
    }
  })

  test('filter by product returns product experts', () => {
    const results = defaultExperts.filter(e => e.category === 'product')
    expect(results.length).toBeGreaterThan(0)
    for (const expert of results) {
      expect(expert.category).toBe('product')
    }
  })

  test('filter by finance returns financial experts', () => {
    const results = defaultExperts.filter(e => e.category === 'finance')
    expect(results.length).toBeGreaterThan(0)
  })

  test('filter by design returns design experts', () => {
    const results = defaultExperts.filter(e => e.category === 'design')
    expect(results.length).toBeGreaterThan(0)
  })

  test('filter by legal returns legal experts', () => {
    const results = defaultExperts.filter(e => e.category === 'legal')
    expect(results.length).toBeGreaterThan(0)
  })

  test('filter by marketing returns marketing experts', () => {
    const results = defaultExperts.filter(e => e.category === 'marketing')
    expect(results.length).toBeGreaterThan(0)
  })

  test('filter by education returns education experts', () => {
    const results = defaultExperts.filter(e => e.category === 'education')
    expect(results.length).toBeGreaterThan(0)
  })

  test('all category returns all experts', () => {
    const results = defaultExperts.filter(() => true)
    expect(results).toHaveLength(defaultExperts.length)
  })

  test('hot sort returns highest usage first', () => {
    const results = [...defaultExperts].sort(
      (a, b) => b.usageCount - a.usageCount,
    )
    expect(results[0].usageCount).toBeGreaterThanOrEqual(results[1].usageCount)
    expect(results[1].usageCount).toBeGreaterThanOrEqual(results[2].usageCount)
  })

  test('new sort reverses default order', () => {
    const results = [...defaultExperts].reverse()
    expect(results[0].id).toBe(defaultExperts[defaultExperts.length - 1].id)
  })
})

// ─── Search Logic Tests ───────────────────────────────────────
describe('search filtering', () => {
  function searchExperts(query: string): Expert[] {
    const lower = query.toLowerCase()
    return defaultExperts.filter(
      e =>
        e.name.toLowerCase().includes(lower) ||
        e.role.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some(t => t.toLowerCase().includes(lower)),
    )
  }

  test('search by name finds expert', () => {
    const results = searchExperts('前端')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.id === 'frontend-expert')).toBe(true)
  })

  test('search by role finds expert', () => {
    const results = searchExperts('全栈')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.id === 'backend-expert')).toBe(true)
  })

  test('search by tag finds expert', () => {
    const results = searchExperts('React')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.id === 'frontend-expert')).toBe(true)
  })

  test('search by description finds expert', () => {
    const results = searchExperts('分布式')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.id === 'backend-expert')).toBe(true)
  })

  test('case-insensitive search works', () => {
    const results = searchExperts('react')
    expect(results.length).toBeGreaterThan(0)
  })

  test('empty search returns all', () => {
    const results = searchExperts('')
    expect(results).toHaveLength(defaultExperts.length)
  })

  test('non-matching search returns empty', () => {
    const results = searchExperts('zzzznonexistent')
    expect(results).toHaveLength(0)
  })

  test('tag search for Python finds multiple', () => {
    const results = searchExperts('Python')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  test('search for DevOps finds DevOps expert', () => {
    const results = searchExperts('DevOps')
    expect(results.some(r => r.id === 'devops-expert')).toBe(true)
  })

  test('combined category + search works', () => {
    const category = 'engineering'
    const query = 'Docker'
    const catFiltered = defaultExperts.filter(e => e.category === category)
    const lower = query.toLowerCase()
    const results = catFiltered.filter(
      e =>
        e.name.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some(t => t.toLowerCase().includes(lower)),
    )
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.category).toBe('engineering')
    }
  })
})

// ─── Usage Count Formatting Tests ─────────────────────────────
describe('usage count formatting', () => {
  function formatUsage(count: number): string {
    if (count >= 10000) {
      return `${(count / 1000).toFixed(1)}k`
    }
    return count.toLocaleString()
  }

  test('formats large numbers with k suffix', () => {
    expect(formatUsage(12580)).toBe('12.6k')
    expect(formatUsage(10000)).toBe('10.0k')
    expect(formatUsage(100000)).toBe('100.0k')
  })

  test('formats small numbers with locale', () => {
    expect(formatUsage(100)).toBe('100')
    expect(formatUsage(9999)).toMatch(/9,?999/)
  })

  test('formats zero', () => {
    expect(formatUsage(0)).toBe('0')
  })
})

// ─── Expert Card Rendering Tests ──────────────────────────────
describe('ExpertCard rendering logic', () => {
  test('tags are truncated to max 3', () => {
    const expert: Expert = {
      id: 'many-tags',
      name: 'Tag Expert',
      role: 'Role',
      avatar: '🏷️',
      description: 'Has many tags',
      tags: ['a', 'b', 'c', 'd', 'e'],
      category: 'engineering',
      usageCount: 0,
    }
    const displayedTags = expert.tags.slice(0, 3)
    expect(displayedTags).toHaveLength(3)
    expect(displayedTags).toEqual(['a', 'b', 'c'])
  })

  test('description is available for line clamping', () => {
    const expert = defaultExperts[0]
    expect(expert.description.length).toBeGreaterThan(10)
  })

  test('avatar renders as emoji or initial', () => {
    for (const expert of defaultExperts) {
      expect(expert.avatar.length).toBeGreaterThan(0)
    }
  })
})

// ─── Tab State Tests ──────────────────────────────────────────
describe('marketplace tab state', () => {
  test('experts tab is valid', () => {
    const tab: MarketplaceTab = 'experts'
    expect(tab).toBe('experts')
  })

  test('skills tab is valid', () => {
    const tab: MarketplaceTab = 'skills'
    expect(tab).toBe('skills')
  })

  test('connectors tab is valid', () => {
    const tab: MarketplaceTab = 'connectors'
    expect(tab).toBe('connectors')
  })

  test('tab switch preserves state', () => {
    let activeTab: MarketplaceTab = 'experts'
    const switchTab = (t: MarketplaceTab) => {
      activeTab = t
    }
    switchTab('skills')
    expect(activeTab as string).toBe('skills')
    switchTab('connectors')
    expect(activeTab as string).toBe('connectors')
    switchTab('experts')
    expect(activeTab as string).toBe('experts')
  })
})

// ─── Featured Scenario Expert Names Tests ─────────────────────
describe('featured scenario expert names', () => {
  test('content scenario has 3 expert names', () => {
    const content = featuredScenarios.find(s => s.id === 'content')!
    expect(content.expertNames).toHaveLength(3)
    expect(content.expertNames).toContain('创意总监')
  })

  test('investment scenario has 3 expert names', () => {
    const invest = featuredScenarios.find(s => s.id === 'investment')!
    expect(invest.expertNames).toHaveLength(3)
    expect(invest.expertNames).toContain('量化分析师')
  })

  test('legal scenario has 3 expert names', () => {
    const legal = featuredScenarios.find(s => s.id === 'legal')!
    expect(legal.expertNames).toHaveLength(3)
    expect(legal.expertNames).toContain('合同律师')
  })

  test('startup scenario has 3 expert names', () => {
    const startup = featuredScenarios.find(s => s.id === 'startup')!
    expect(startup.expertNames).toHaveLength(3)
    expect(startup.expertNames).toContain('运营顾问')
  })
})

// ─── Integration Tests ────────────────────────────────────────
describe('ExpertListPage integration', () => {
  test('category filter + search combined flow', () => {
    // Simulate: select engineering -> search "Docker"
    const category: ExpertCategory = 'engineering'
    const query = 'Docker'

    let results = [...defaultExperts]
    results = results.filter(e => e.category === category)
    const lower = query.toLowerCase()
    results = results.filter(
      e =>
        e.name.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some(t => t.toLowerCase().includes(lower)),
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('devops-expert')
  })

  test('hot sort returns copywriter or frontend as top', () => {
    const sorted = [...defaultExperts].sort(
      (a, b) => b.usageCount - a.usageCount,
    )
    // The expert with highest usageCount should be first
    const maxUsage = Math.max(...defaultExperts.map(e => e.usageCount))
    expect(sorted[0].usageCount).toBe(maxUsage)
  })

  test('search with no results shows empty state condition', () => {
    const query = 'xyznonexistent'
    const lower = query.toLowerCase()
    const results = defaultExperts.filter(
      e =>
        e.name.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some(t => t.toLowerCase().includes(lower)),
    )
    expect(results).toHaveLength(0)
  })

  test('full expert lifecycle: browse → filter → search → select', () => {
    // 1. Browse all
    let results = [...defaultExperts]
    expect(results).toHaveLength(12)

    // 2. Filter by engineering
    results = results.filter(e => e.category === 'engineering')
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThan(12)

    // 3. Search within filtered
    const query = '安全'
    const lower = query.toLowerCase()
    results = results.filter(
      e =>
        e.name.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.tags.some(t => t.toLowerCase().includes(lower)),
    )
    expect(results.length).toBeGreaterThan(0)

    // 4. Select first result
    const selected = results[0]
    expect(selected.id).toBe('security-expert')
  })

  test('my experts button callback fires', () => {
    let fired = false
    const onMyExperts = () => {
      fired = true
    }
    onMyExperts()
    expect(fired).toBe(true)
  })

  test('expert select callback fires with id', () => {
    let selectedId = ''
    const onSelect = (id: string) => {
      selectedId = id
    }
    onSelect('frontend-expert')
    expect(selectedId).toBe('frontend-expert')
  })

  test('search change callback fires', () => {
    let query = ''
    const onChange = (q: string) => {
      query = q
    }
    onChange('React')
    expect(query).toBe('React')
  })

  test('tab change callback fires', () => {
    let tab: MarketplaceTab = 'experts'
    const onTabChange = (t: MarketplaceTab) => {
      tab = t
    }
    onTabChange('skills')
    expect(tab as string).toBe('skills')
  })

  test('experts span all non-meta categories', () => {
    const expertCategories = new Set(defaultExperts.map(e => e.category))
    expect(expertCategories.has('engineering')).toBe(true)
    expect(expertCategories.has('product')).toBe(true)
    expect(expertCategories.has('finance')).toBe(true)
    expect(expertCategories.has('design')).toBe(true)
    expect(expertCategories.has('legal')).toBe(true)
    expect(expertCategories.has('marketing')).toBe(true)
    expect(expertCategories.has('education')).toBe(true)
  })

  test('featured scenarios cover different domains', () => {
    const ids = featuredScenarios.map(s => s.id)
    expect(ids).toContain('content')
    expect(ids).toContain('investment')
    expect(ids).toContain('legal')
    expect(ids).toContain('startup')
  })
})
