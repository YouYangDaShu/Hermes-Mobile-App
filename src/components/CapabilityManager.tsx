import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowLeft, Check, ChevronRight, RefreshCw, Search, Wrench } from 'lucide-react'

import { installHubSkill, loadProfileDetails, searchHubSkills, setProfileCapabilities, type Capability, type LiveProfile, type LiveSession, type ProfileDetails, type SkillSearchResult } from '../hermes'
import { BotAvatar } from './BotAvatar'
import { useEdgeSwipeBack } from '../edge-swipe'

type Props = { profile?: LiveProfile; session: LiveSession; onBack: () => void; onUpdated: () => void }
const titleize = (value: string) => value.split(/[-_]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

export function CapabilityManager({ profile, session, onBack, onUpdated }: Props) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, onBack)
  const [details, setDetails] = useState<ProfileDetails | null>(null)
  const [skills, setSkills] = useState<Capability[]>([])
  const [toolsets, setToolsets] = useState<Capability[]>([])
  const [query, setQuery] = useState('')
  const [hubResults, setHubResults] = useState<SkillSearchResult[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [installing, setInstalling] = useState('')
  const [error, setError] = useState('')
  const botName = profile?.display_name || titleize(session.profile)

  const reload = async () => {
    setLoading(true); setError('')
    try { const next = await loadProfileDetails(session.profile); setDetails(next); setSkills(next.skills || []); setToolsets(next.toolsets || []); setHubResults(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载该智能体的能力配置。') }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [session.profile])

  const visibleSkills = useMemo(() => skills.filter(item => `${item.name} ${item.description || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [skills, query])
  const visibleToolsets = useMemo(() => toolsets.filter(item => `${item.name} ${item.label || ''} ${item.description || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [toolsets, query])
  const changed = Boolean(details && (JSON.stringify(skills) !== JSON.stringify(details.skills || []) || JSON.stringify(toolsets) !== JSON.stringify(details.toolsets || [])))
  const enabledSkills = skills.filter(item => item.enabled).length
  const enabledToolsets = toolsets.filter(item => item.enabled).length
  const toggle = (set: Dispatch<SetStateAction<Capability[]>>, name: string) => set(items => items.map(item => item.name === name ? { ...item, enabled: !item.enabled } : item))

  const save = async () => {
    setSaving(true); setError('')
    try { await setProfileCapabilities(session.profile, skills, toolsets); await reload(); onUpdated() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法保存能力配置修改。') }
    finally { setSaving(false) }
  }
  const searchHub = async () => {
    const value = query.trim(); if (!value) { setHubResults(null); return }
    setLoading(true); setError('')
    try { setHubResults(await searchHubSkills(session.profile, value)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '搜索技能中心失败。') }
    finally { setLoading(false) }
  }
  const install = async (name: string) => {
    setInstalling(name); setError('')
    try { await installHubSkill(session.profile, name); await reload(); onUpdated() }
    catch (reason) { setError(reason instanceof Error ? reason.message : `无法安装技能 “${name}”。`) }
    finally { setInstalling('') }
  }

  return <main ref={shellRef} className="app management-sheet">
    <header className="management-head"><button className="round-control" onClick={onBack} aria-label="返回智能体配置"><ArrowLeft size={18}/></button><b>能力管理</b><button className="round-control" onClick={() => void reload()} aria-label="刷新能力配置"><RefreshCw size={17}/></button></header>
    <section className="capability-context"><BotAvatar profile={profile} fallbackName={session.profile} variant="header"/><span><b>{botName}</b><small>管理该智能体可调用的工具与技能</small></span></section>
    <div className="capability-search"><Search size={16}/><input value={query} onChange={event => { setQuery(event.target.value); setHubResults(null) }} onKeyDown={event => event.key === 'Enter' && void searchHub()} placeholder="搜索已安装技能或技能中心 (Skills Hub)…"/><button disabled={!query.trim() || loading} onClick={() => void searchHub()}>搜索</button></div>
    {error && <p className="management-error">{error}</p>}
    {changed && <button className="capability-save" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : <><Check size={15}/> 保存更改</>}</button>}
    {hubResults && <section className="capability-group"><div className="capability-group-head"><span>技能中心搜索结果</span><small>{hubResults.length}</small></div>{hubResults.length ? <div className="capability-list">{hubResults.map(item => <div className="capability-row" key={item.name}><Wrench size={17}/><span><b>{item.name}</b><small>{item.description || '可安装的 Hermes 技能'}</small></span>{skills.some(skill => skill.name === item.name) ? <em>已安装</em> : <button className="capability-action" disabled={Boolean(installing)} onClick={() => void install(item.name)}>{installing === item.name ? '添加中…' : '添加'}</button>}</div>)}</div> : <p className="management-empty">未找到与 “{query}” 匹配的技能。</p>}</section>}
    <section className="capability-group"><div className="capability-group-head"><span>已安装技能 (Skills)</span><small>已启用 {enabledSkills}/{skills.length}</small></div>{loading && !details ? <p className="management-empty">正在加载能力配置…</p> : visibleSkills.length ? <div className="capability-list">{visibleSkills.map(item => <CapabilityRow item={item} key={item.name} onToggle={() => toggle(setSkills, item.name)}/>)}</div> : <p className="management-empty">未找到匹配的已安装技能。</p>}</section>
    <section className="capability-group"><div className="capability-group-head"><span>工具集 (Toolsets)</span><small>已启用 {enabledToolsets}/{toolsets.length}</small></div><p className="capability-note">工具集配置保存后将在新建或重置的会话中生效。</p>{visibleToolsets.length ? <div className="capability-list">{visibleToolsets.map(item => <CapabilityRow item={item} key={item.name} onToggle={() => toggle(setToolsets, item.name)}/>)}</div> : <p className="management-empty">未找到匹配的工具集。</p>}</section>
  </main>
}

function CapabilityRow({ item, onToggle }: { item: Capability; onToggle: () => void }) {
  return <div className="capability-row"><Wrench size={17}/><span><b>{item.label || item.name}</b><small>{item.description || (item.tool_count ? `${item.tool_count} 个工具` : 'Hermes 扩展能力')}</small></span><button className={`capability-toggle ${item.enabled ? 'on' : ''}`} onClick={onToggle} aria-label={`${item.enabled ? '禁用' : '启用'} ${item.name}`}><i/>{item.enabled ? '已开启' : '已关闭'}</button></div>
}
