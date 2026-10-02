import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Cpu, FileText, Info, Pencil, Save, SlidersHorizontal, Wrench, X } from 'lucide-react'

import { loadModelOptions, loadProfileDetails, setProfileDescription, setProfileModel, setProfileSoul, type LiveProfile, type LiveSession, type ModelOptions, type ProfileDetails } from '../hermes'
import { BotAvatar } from './BotAvatar'
import { CapabilityManager } from './CapabilityManager'
import { useEdgeSwipeBack } from '../edge-swipe'

type Props = { profile?: LiveProfile; session: LiveSession; onClose: () => void; onUpdated: () => void }
const titleize = (value: string) => value.split(/[-_]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

export function BotProfileSheet({ profile, session, onClose, onUpdated }: Props) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, onClose)
  const [details, setDetails] = useState<ProfileDetails | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOptions>({})
  const [soulDraft, setSoulDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [editingAbout, setEditingAbout] = useState(false)
  const [managingCapabilities, setManagingCapabilities] = useState(false)
  const [changingModel, setChangingModel] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [savingSoul, setSavingSoul] = useState(false)
  const [savingAbout, setSavingAbout] = useState(false)
  const [error, setError] = useState('')
  const botName = profile?.display_name || titleize(session.profile)
  const configuredModel = details?.model?.default || profile?.model || 'Hermes 默认'
  const configuredProvider = details?.model?.provider || profile?.provider || ''
  const activeModel = session.model || configuredModel
  const isSessionOverride = Boolean(session.model && session.model !== configuredModel)
  const soulDirty = details !== null && soulDraft !== (details.soul || '')
  const aboutDirty = details !== null && descriptionDraft !== (details.description || '')
  const models = useMemo(() => (modelOptions.providers || []).flatMap(provider => (provider.featured_models?.length ? provider.featured_models : provider.models || []).map(name => ({ name, provider: provider.slug, providerName: provider.name, authenticated: provider.authenticated !== false }))), [modelOptions])
  const reload = async () => { const next = await loadProfileDetails(session.profile); setDetails(next); setSoulDraft(next.soul || ''); setDescriptionDraft(next.description || '') }

  useEffect(() => { let active = true; setError(''); void Promise.all([loadProfileDetails(session.profile), loadModelOptions(session.profile)]).then(([nextDetails, nextOptions]) => { if (active) { setDetails(nextDetails); setSoulDraft(nextDetails.soul || ''); setDescriptionDraft(nextDetails.description || ''); setModelOptions(nextOptions) } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '无法加载智能体设置。') }); return () => { active = false } }, [session.profile])
  useEffect(() => {
    if (!managingCapabilities) return
    const onMobileBack = (event: Event) => {
      event.preventDefault()
      setManagingCapabilities(false)
    }
    window.addEventListener('hermes-mobile-back', onMobileBack)
    return () => window.removeEventListener('hermes-mobile-back', onMobileBack)
  }, [managingCapabilities])
  const saveSoul = async () => { if (!soulDirty) return; setSavingSoul(true); setError(''); try { await setProfileSoul(session.profile, soulDraft); await reload(); onUpdated() } catch (reason) { setError(reason instanceof Error ? reason.message : '无法保存智能体的 SOUL.md。') } finally { setSavingSoul(false) } }
  const saveAbout = async () => { if (!aboutDirty) { setEditingAbout(false); return }; setSavingAbout(true); setError(''); try { await setProfileDescription(session.profile, descriptionDraft); await reload(); setEditingAbout(false); onUpdated() } catch (reason) { setError(reason instanceof Error ? reason.message : '无法保存智能体简介。') } finally { setSavingAbout(false) } }
  const chooseDefaultModel = async (provider: string, model: string) => { setSavingModel(true); setError(''); try { await setProfileModel(session.profile, provider, model); await reload(); setChangingModel(false); onUpdated() } catch (reason) { setError(reason instanceof Error ? reason.message : '无法更新智能体默认模型。') } finally { setSavingModel(false) } }

  if (managingCapabilities) return <CapabilityManager profile={profile} session={session} onBack={() => setManagingCapabilities(false)} onUpdated={() => { void reload(); onUpdated() }}/>
  return <main ref={shellRef} className="app profile-sheet">
    <header className="profile-sheet-head"><button className="round-control" onClick={onClose} aria-label="关闭智能体设置"><X size={18}/></button><b>智能体配置</b><span/></header>
    <section className="profile-identity"><BotAvatar profile={profile} fallbackName={session.profile} variant="welcome"/><h1>{botName}</h1><p>@{session.profile}</p></section>
    {error && <p className="profile-error">{error}</p>}
    <section className="profile-section profile-soul"><div className="profile-section-label"><FileText size={14}/> 人设设定 (SOUL)</div><textarea aria-label={`${botName} SOUL.md`} disabled={!details || savingSoul} value={soulDraft} onChange={event => setSoulDraft(event.target.value)} placeholder="正在加载 SOUL.md…"/><div className="profile-soul-footer"><p>Hermes 将自动注入智能体协作与消息通信协议。</p>{soulDirty && <button disabled={savingSoul} onClick={() => void saveSoul()}>{savingSoul ? '保存中…' : <><Save size={14}/> 保存 SOUL</>}</button>}</div></section>
    <section className="profile-section"><div className="profile-section-label"><Cpu size={14}/> 智能体默认模型</div><button className="profile-model-row" onClick={() => setChangingModel(value => !value)}><span><b>{configuredModel}</b><small>{configuredProvider || 'Hermes 默认配置'}</small></span><ChevronRight size={17} className={changingModel ? 'turn' : ''}/></button>{changingModel && <div className="profile-model-picker">{models.filter(option => option.authenticated).map(option => <button disabled={savingModel} key={`${option.provider}:${option.name}`} className={option.name === configuredModel && option.provider === configuredProvider ? 'selected' : ''} onClick={() => void chooseDefaultModel(option.provider, option.name)}><span><b>{option.name}</b><small>{option.providerName}</small></span>{option.name === configuredModel && option.provider === configuredProvider && <Check size={15}/>}</button>)}</div>}</section>
    <section className="profile-section"><div className="profile-section-label"><SlidersHorizontal size={14}/> 当前会话模型</div><div className="profile-session-row"><span><b>{activeModel}</b><small>{isSessionOverride ? '单会话专属覆盖（在输入框中设置）' : '跟随该智能体默认模型'}</small></span></div><p className="profile-hint">输入框中的模型选择器仅对当前对话生效；修改上方智能体默认模型将作用于新会话及未单独设置的会话。</p></section>
    <section className="profile-section"><div className="profile-section-label"><Info size={14}/> 智能体简介 <button className="profile-edit" onClick={() => setEditingAbout(value => !value)} aria-label="编辑智能体简介"><Pencil size={13}/></button></div>{editingAbout ? <><textarea className="profile-about-editor" aria-label={`${botName} 简介`} disabled={!details || savingAbout} value={descriptionDraft} onChange={event => setDescriptionDraft(event.target.value)} placeholder="描述该智能体的主要职责与擅长领域…"/><div className="profile-about-actions"><button onClick={() => { setDescriptionDraft(details?.description || ''); setEditingAbout(false) }}>取消</button>{aboutDirty && <button className="save" disabled={savingAbout} onClick={() => void saveAbout()}>{savingAbout ? '保存中…' : '保存简介'}</button>}</div></> : <p>{details?.description || profile?.description || '暂无该智能体的详细描述。'}</p>}</section>
    <button className="profile-section capability-entry" onClick={() => setManagingCapabilities(true)}><span><span className="profile-section-label"><Wrench size={14}/> 能力管理</span><small>管理该智能体启用的技能 (Skills) 与工具集 (Toolsets)</small></span><span className="capability-counts"><b>{details?.toolsets?.filter(item => item.enabled).length ?? '—'}</b><small>工具集</small><b>{details?.skills?.filter(item => item.enabled).length ?? '—'}</b><small>技能</small></span><ChevronRight size={18}/></button>
  </main>
}
