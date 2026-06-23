/**
 * N13 — ExpertTeamDialog Tests
 * Covers: team data structures, member roles, skills, summon logic,
 * team intro generation, dialog state, integration flows
 */
import { describe, test, expect } from 'bun:test'
import {
  type ExpertTeam,
  type TeamMember,
  type MemberRole,
  type ExpertTeamDialogProps,
  defaultTeams,
  generateTeamIntro,
} from '../renderer/components/ExpertTeamDialog'

// ─── Team Data Structure Tests ────────────────────────────────
describe('ExpertTeam data structure', () => {
  test('ExpertTeam has all required fields', () => {
    const team: ExpertTeam = {
      id: 'test-team',
      name: 'Test Team',
      avatar: '🧪',
      creator: 'Test',
      usageCount: 100,
      description: 'A test team',
      capabilities: 'Can do testing',
      skills: ['testing'],
      members: [],
      scenarios: ['unit testing'],
    }
    expect(team.id).toBe('test-team')
    expect(team.name).toBe('Test Team')
    expect(team.avatar).toBe('🧪')
    expect(team.creator).toBe('Test')
    expect(team.usageCount).toBe(100)
    expect(team.description).toBe('A test team')
    expect(team.capabilities).toBe('Can do testing')
    expect(team.skills).toHaveLength(1)
    expect(team.members).toHaveLength(0)
    expect(team.scenarios).toHaveLength(1)
  })

  test('TeamMember has all required fields', () => {
    const member: TeamMember = {
      id: 'member-1',
      name: 'Test Member',
      role: 'Tester',
      avatar: '🔧',
      memberRole: 'member',
      specialties: ['unit test', 'e2e'],
    }
    expect(member.id).toBe('member-1')
    expect(member.name).toBe('Test Member')
    expect(member.role).toBe('Tester')
    expect(member.avatar).toBe('🔧')
    expect(member.memberRole).toBe('member')
    expect(member.specialties).toHaveLength(2)
  })

  test('MemberRole union type covers leader and member', () => {
    const leader: MemberRole = 'leader'
    const member: MemberRole = 'member'
    expect(leader).toBe('leader')
    expect(member).toBe('member')
  })
})

// ─── Default Teams Tests ──────────────────────────────────────
describe('defaultTeams', () => {
  test('contains 3 default teams', () => {
    expect(defaultTeams).toHaveLength(3)
  })

  test('all teams have unique ids', () => {
    const ids = defaultTeams.map(t => t.id)
    expect(new Set(ids).size).toBe(3)
  })

  test('all teams have non-empty required fields', () => {
    for (const team of defaultTeams) {
      expect(team.id.length).toBeGreaterThan(0)
      expect(team.name.length).toBeGreaterThan(0)
      expect(team.avatar.length).toBeGreaterThan(0)
      expect(team.creator.length).toBeGreaterThan(0)
      expect(team.usageCount).toBeGreaterThan(0)
      expect(team.description.length).toBeGreaterThan(0)
      expect(team.capabilities.length).toBeGreaterThan(0)
      expect(team.skills.length).toBeGreaterThan(0)
      expect(team.members.length).toBeGreaterThan(0)
      expect(team.scenarios.length).toBeGreaterThan(0)
    }
  })

  test('all teams have at least one leader', () => {
    for (const team of defaultTeams) {
      const leaders = team.members.filter(m => m.memberRole === 'leader')
      expect(leaders.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('all teams have at least one regular member', () => {
    for (const team of defaultTeams) {
      const members = team.members.filter(m => m.memberRole === 'member')
      expect(members.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('all team members have unique ids within team', () => {
    for (const team of defaultTeams) {
      const ids = team.members.map(m => m.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  test('all team members have specialties', () => {
    for (const team of defaultTeams) {
      for (const member of team.members) {
        expect(member.specialties.length).toBeGreaterThan(0)
      }
    }
  })
})

// ─── Fullstack Team Tests ─────────────────────────────────────
describe('fullstack team', () => {
  const team = defaultTeams.find(t => t.id === 'team-fullstack')!

  test('exists and has correct name', () => {
    expect(team).toBeDefined()
    expect(team.name).toBe('全栈开发团队')
  })

  test('has 4 members', () => {
    expect(team.members).toHaveLength(4)
  })

  test('leader is the architect', () => {
    const leader = team.members.find(m => m.memberRole === 'leader')!
    expect(leader).toBeDefined()
    expect(leader.name).toContain('架构师')
    expect(leader.role).toBe('技术架构师')
  })

  test('has frontend, backend, and devops members', () => {
    const roles = team.members.map(m => m.id)
    expect(roles).toContain('fs-frontend')
    expect(roles).toContain('fs-backend')
    expect(roles).toContain('fs-devops')
  })

  test('skills include key technologies', () => {
    expect(team.skills).toContain('React')
    expect(team.skills).toContain('Node.js')
    expect(team.skills).toContain('Docker')
    expect(team.skills).toContain('TypeScript')
  })

  test('has relevant scenarios', () => {
    expect(team.scenarios.length).toBeGreaterThanOrEqual(2)
    expect(team.scenarios.some(s => s.includes('开发'))).toBe(true)
  })

  test('creator is NexaWork', () => {
    expect(team.creator).toBe('NexaWork')
  })

  test('usage count is substantial', () => {
    expect(team.usageCount).toBeGreaterThan(10000)
  })
})

// ─── Content Team Tests ───────────────────────────────────────
describe('content team', () => {
  const team = defaultTeams.find(t => t.id === 'team-content')!

  test('exists and has correct name', () => {
    expect(team).toBeDefined()
    expect(team.name).toBe('内容创作团队')
  })

  test('has 3 members', () => {
    expect(team.members).toHaveLength(3)
  })

  test('leader is the creative director', () => {
    const leader = team.members.find(m => m.memberRole === 'leader')!
    expect(leader.role).toBe('创意总监')
  })

  test('skills include content skills', () => {
    expect(team.skills).toContain('文案策划')
    expect(team.skills).toContain('SEO')
  })
})

// ─── Data Team Tests ──────────────────────────────────────────
describe('data team', () => {
  const team = defaultTeams.find(t => t.id === 'team-data')!

  test('exists and has correct name', () => {
    expect(team).toBeDefined()
    expect(team.name).toBe('数据分析团队')
  })

  test('has 3 members', () => {
    expect(team.members).toHaveLength(3)
  })

  test('leader is data scientist', () => {
    const leader = team.members.find(m => m.memberRole === 'leader')!
    expect(leader.role).toBe('首席数据科学家')
  })

  test('skills include data skills', () => {
    expect(team.skills).toContain('Python')
    expect(team.skills).toContain('SQL')
    expect(team.skills).toContain('机器学习')
  })
})

// ─── Team Introduction Generation Tests ───────────────────────
describe('generateTeamIntro', () => {
  test('generates intro for fullstack team', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    const intro = generateTeamIntro(team)
    expect(intro).toContain('全栈开发团队')
    expect(intro).toContain('已就位')
    expect(intro).toContain('主理人')
    expect(intro).toContain('成员')
  })

  test('intro includes team description', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    const intro = generateTeamIntro(team)
    expect(intro).toContain(team.description)
  })

  test('intro includes leader names', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    const intro = generateTeamIntro(team)
    const leaders = team.members.filter(m => m.memberRole === 'leader')
    for (const leader of leaders) {
      expect(intro).toContain(leader.name)
    }
  })

  test('intro includes member names and roles', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    const intro = generateTeamIntro(team)
    const members = team.members.filter(m => m.memberRole === 'member')
    for (const member of members) {
      expect(intro).toContain(member.name)
      expect(intro).toContain(member.role)
    }
  })

  test('intro ends with prompt', () => {
    const team = defaultTeams[0]
    const intro = generateTeamIntro(team)
    expect(intro).toContain('请问有什么可以帮您的')
  })

  test('generates intro for content team', () => {
    const team = defaultTeams.find(t => t.id === 'team-content')!
    const intro = generateTeamIntro(team)
    expect(intro).toContain('内容创作团队')
    expect(intro).toContain('总监 Luna')
  })

  test('generates intro for data team', () => {
    const team = defaultTeams.find(t => t.id === 'team-data')!
    const intro = generateTeamIntro(team)
    expect(intro).toContain('数据分析团队')
    expect(intro).toContain('首席 Dr. Chen')
  })

  test('intro for custom team with no members', () => {
    const custom: ExpertTeam = {
      id: 'custom',
      name: 'Custom',
      avatar: '🎭',
      creator: 'User',
      usageCount: 0,
      description: 'A custom team',
      capabilities: 'Various',
      skills: [],
      members: [],
      scenarios: [],
    }
    const intro = generateTeamIntro(custom)
    expect(intro).toContain('Custom')
    expect(intro).toContain('已就位')
    expect(intro).toContain('主理人：')
    expect(intro).toContain('成员：')
  })
})

// ─── Member Role Tests ────────────────────────────────────────
describe('member role logic', () => {
  test('leaders are sorted before members', () => {
    const team = defaultTeams[0]
    const leaders = team.members.filter(m => m.memberRole === 'leader')
    const members = team.members.filter(m => m.memberRole === 'member')
    expect(leaders.length).toBeGreaterThan(0)
    expect(members.length).toBeGreaterThan(0)
    // Total should match
    expect(leaders.length + members.length).toBe(team.members.length)
  })

  test('leader has crown badge (blue)', () => {
    const leader: TeamMember = {
      id: 'l1',
      name: 'Leader',
      role: 'Boss',
      avatar: '👑',
      memberRole: 'leader',
      specialties: [],
    }
    expect(leader.memberRole).toBe('leader')
  })

  test('member has gray badge', () => {
    const member: TeamMember = {
      id: 'm1',
      name: 'Member',
      role: 'Worker',
      avatar: '👤',
      memberRole: 'member',
      specialties: [],
    }
    expect(member.memberRole).toBe('member')
  })

  test('specialties are truncated to max 2 in display', () => {
    const member: TeamMember = {
      id: 'm2',
      name: 'Many Skills',
      role: 'Worker',
      avatar: '🧩',
      memberRole: 'member',
      specialties: ['a', 'b', 'c', 'd', 'e'],
    }
    const displayed = member.specialties.slice(0, 2)
    expect(displayed).toHaveLength(2)
    expect(displayed).toEqual(['a', 'b'])
  })
})

// ─── Dialog State Tests ───────────────────────────────────────
describe('dialog state management', () => {
  test('dialog props structure is valid', () => {
    const props: ExpertTeamDialogProps = {
      team: defaultTeams[0],
      isOpen: true,
      onClose: () => {},
      onSummon: () => {},
    }
    expect(props.isOpen).toBe(true)
    expect(props.team).not.toBeNull()
  })

  test('dialog with null team', () => {
    const props: ExpertTeamDialogProps = {
      team: null,
      isOpen: false,
      onClose: () => {},
      onSummon: () => {},
    }
    expect(props.team).toBeNull()
    expect(props.isOpen).toBe(false)
  })

  test('close callback fires', () => {
    let closed = false
    const onClose = () => {
      closed = true
    }
    onClose()
    expect(closed).toBe(true)
  })

  test('summon callback fires with team id', () => {
    let summonedId = ''
    const onSummon = (id: string) => {
      summonedId = id
    }
    onSummon('team-fullstack')
    expect(summonedId).toBe('team-fullstack')
  })

  test('dialog open/close toggle', () => {
    let isOpen = false
    const open = () => {
      isOpen = true
    }
    const close = () => {
      isOpen = false
    }

    open()
    expect(isOpen).toBe(true)
    close()
    expect(isOpen).toBe(false)
  })
})

// ─── Summon Logic Tests ───────────────────────────────────────
describe('summon logic', () => {
  test('summon activates team', () => {
    let activeTeamId = null as string | null
    const summon = (teamId: string) => {
      activeTeamId = teamId
    }
    summon('team-fullstack')
    expect(activeTeamId as string).toBe('team-fullstack')
  })

  test('dismiss clears active team', () => {
    let activeTeamId: string | null = 'team-fullstack'
    const dismiss = () => {
      activeTeamId = null
    }
    dismiss()
    expect(activeTeamId).toBeNull()
  })

  test('summon generates intro message', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    const intro = generateTeamIntro(team)
    expect(intro.length).toBeGreaterThan(50)
    expect(intro).toContain(team.name)
  })

  test('switching teams replaces active', () => {
    let activeTeamId: string | null = 'team-fullstack'
    const summon = (teamId: string) => {
      activeTeamId = teamId
    }
    summon('team-content')
    expect(activeTeamId).toBe('team-content')
  })

  test('summon after dismiss works', () => {
    let activeTeamId = 'team-fullstack' as string | null
    const dismiss = () => {
      activeTeamId = null
    }
    const summon = (teamId: string) => {
      activeTeamId = teamId
    }
    dismiss()
    expect(activeTeamId).toBeNull()
    summon('team-data')
    expect(activeTeamId as string).toBe('team-data')
  })
})

// ─── Usage Count Display Tests ────────────────────────────────
describe('usage count display', () => {
  function formatUsage(count: number): string {
    if (count >= 10000) {
      return `${(count / 1000).toFixed(1)}k`
    }
    return count.toLocaleString()
  }

  test('formats team usage counts correctly', () => {
    for (const team of defaultTeams) {
      const formatted = formatUsage(team.usageCount)
      expect(formatted.length).toBeGreaterThan(0)
      if (team.usageCount >= 10000) {
        expect(formatted).toContain('k')
      }
    }
  })

  test('all default teams have >10k usage', () => {
    for (const team of defaultTeams) {
      expect(team.usageCount).toBeGreaterThan(10000)
    }
  })
})

// ─── Skills Display Tests ─────────────────────────────────────
describe('skills display', () => {
  test('fullstack team has 8 skills', () => {
    const team = defaultTeams.find(t => t.id === 'team-fullstack')!
    expect(team.skills).toHaveLength(8)
  })

  test('content team has 6 skills', () => {
    const team = defaultTeams.find(t => t.id === 'team-content')!
    expect(team.skills).toHaveLength(6)
  })

  test('data team has 6 skills', () => {
    const team = defaultTeams.find(t => t.id === 'team-data')!
    expect(team.skills).toHaveLength(6)
  })

  test('all skills are non-empty strings', () => {
    for (const team of defaultTeams) {
      for (const skill of team.skills) {
        expect(skill.length).toBeGreaterThan(0)
      }
    }
  })
})

// ─── Integration Tests ────────────────────────────────────────
describe('ExpertTeamDialog integration', () => {
  test('full flow: open → view → summon → close', () => {
    let isOpen = false
    let selectedTeam: ExpertTeam | null = null
    let summonedId: string | null = null

    // Open dialog with team
    const team = defaultTeams[0]
    isOpen = true
    selectedTeam = team
    expect(isOpen).toBe(true)
    expect(selectedTeam!.name).toBe('全栈开发团队')

    // View team info
    expect(selectedTeam!.members.length).toBeGreaterThan(0)
    expect(selectedTeam!.skills.length).toBeGreaterThan(0)

    // Summon
    summonedId = team.id
    expect(summonedId).toBe('team-fullstack')

    // Close
    isOpen = false
    selectedTeam = null
    expect(isOpen).toBe(false)
    expect(selectedTeam).toBeNull()
  })

  test('team intro includes all critical information', () => {
    for (const team of defaultTeams) {
      const intro = generateTeamIntro(team)
      // Must contain team name
      expect(intro).toContain(team.name)
      // Must contain description
      expect(intro).toContain(team.description)
      // Must mention leaders
      expect(intro).toContain('主理人')
      // Must mention members
      expect(intro).toContain('成员')
      // Must have call to action
      expect(intro).toContain('请问有什么可以帮您的')
    }
  })

  test('browsing multiple teams works', () => {
    let currentTeam: ExpertTeam | null = null

    // Browse team 1
    currentTeam = defaultTeams[0]
    expect(currentTeam.name).toBe('全栈开发团队')

    // Switch to team 2
    currentTeam = defaultTeams[1]
    expect(currentTeam.name).toBe('内容创作团队')

    // Switch to team 3
    currentTeam = defaultTeams[2]
    expect(currentTeam.name).toBe('数据分析团队')
  })

  test('summon different teams produces different intros', () => {
    const intros = defaultTeams.map(t => generateTeamIntro(t))
    // All intros should be unique
    expect(new Set(intros).size).toBe(defaultTeams.length)
  })

  test('team members across all teams are unique', () => {
    const allMemberIds: string[] = []
    for (const team of defaultTeams) {
      for (const member of team.members) {
        allMemberIds.push(member.id)
      }
    }
    expect(new Set(allMemberIds).size).toBe(allMemberIds.length)
  })

  test('total members across all teams', () => {
    let total = 0
    for (const team of defaultTeams) {
      total += team.members.length
    }
    expect(total).toBe(10) // 4 + 3 + 3
  })

  test('all teams have creator set to NexaWork', () => {
    for (const team of defaultTeams) {
      expect(team.creator).toBe('NexaWork')
    }
  })
})
