import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Plus, X } from 'lucide-react'

import { errorMessage } from '../connection-state'
import { useEdgeSwipeBack } from '../edge-swipe'
import { createCronJob, instantiateCronBlueprint, loadCronBlueprints, loadCronDeliveryTargets, loadModelOptions, type AutomationBlueprint, type CronDeliveryTarget, type LiveProfile, type ModelOptions } from '../hermes'

type Props = { profiles: LiveProfile[]; onClose: () => void; onCreated: () => Promise<void> }
const frequencies = [
  { id: 'daily', label: '每天上午 9:00', schedule: '0 9 * * *' },
  { id: 'weekdays', label: '工作日上午 9:00', schedule: '0 9 * * 1-5' },
  { id: 'hourly', label: '每小时执行一次', schedule: '0 * * * *' },
  { id: 'every-15', label: '每 15 分钟执行一次', schedule: '*/15 * * * *' },
  { id: 'custom', label: '自定义执行周期', schedule: '' }
]
const titleizeBot = (value: string) => value.split(/[-_\s]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(' ')

export function NewTaskSheet({ profiles, onClose, onCreated }: Props) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, onClose)
  const [blueprints, setBlueprints] = useState<AutomationBlueprint[]>([])
  const [targets, setTargets] = useState<CronDeliveryTarget[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOptions>({})
  const [template, setTemplate] = useState('custom')
  const [bot, setBot] = useState(profiles[0]?.name || '')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [schedule, setSchedule] = useState('0 9 * * *')
  const [deliver, setDeliver] = useState<string[]>(() => profiles[0] ? [`bot-chat:${profiles[0].name}`] : [])
  const [modelChoice, setModelChoice] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedBlueprint = blueprints.find(item => item.key === template)
  const modelOptionsFlat = useMemo(() => (modelOptions.providers || []).flatMap(provider => (provider.featured_models?.length ? provider.featured_models : provider.models || []).map(model => ({ model, provider: provider.slug, label: `${provider.name} · ${model}` }))), [modelOptions])
  const botDeliveryTargets = useMemo(() => {
    const profileByName = new Map(profiles.map(profile => [profile.name, profile]))
    const discovered = targets.filter(target => target.id.startsWith('bot-chat:'))
    const source = discovered.length ? discovered : profiles.map(profile => ({ id: `bot-chat:${profile.name}`, name: profile.name, home_target_set: true }))
    return source.map(target => {
      const profileName = target.id.slice('bot-chat:'.length)
      const profile = profileByName.get(profileName)
      return { ...target, name: profile?.display_name || titleizeBot(profileName) }
    })
  }, [profiles, targets])

  useEffect(() => { let active = true; void Promise.all([loadCronBlueprints(), loadCronDeliveryTargets(), loadModelOptions(bot)]).then(([nextBlueprints, nextTargets, nextModels]) => { if (!active) return; setBlueprints(nextBlueprints); setTargets(nextTargets); setModelOptions(nextModels) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '无法加载新建任务选项。') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [bot])
  useEffect(() => { if (!selectedBlueprint) return; const seeded: Record<string, string> = {}; selectedBlueprint.fields.forEach(field => { seeded[field.name] = field.name === 'deliver' ? (bot ? `bot-chat:${bot}` : '') : field.default || '' }); setValues(seeded) }, [selectedBlueprint, bot])
  const submit = async () => {
    setSaving(true); setError('')
    try {
      if (!bot) throw new Error('请为该任务指定归属智能体。')
      const selectedDeliveries = selectedBlueprint ? (values.deliver || '').split(',').filter(Boolean) : deliver
      if (!selectedDeliveries.length) throw new Error('请至少选择一个智能体接收任务结果。')
      if (selectedBlueprint) { await instantiateCronBlueprint(bot, selectedBlueprint.key, { ...values, deliver: selectedDeliveries.join(',') }) }
      else {
        if (!prompt.trim()) throw new Error('提示词不能为空。')
        if (!schedule.trim()) throw new Error('调度周期不能为空。')
        const [provider, ...modelParts] = modelChoice.split(':'); const model = modelParts.join(':')
        await createCronJob(bot, { name: name.trim() || undefined, prompt: prompt.trim(), schedule: schedule.trim(), deliver: selectedDeliveries.join(','), ...(model ? { model, provider } : {}) })
      }
      await onCreated(); onClose()
    } catch (reason) { setError(errorMessage(reason, '创建定时任务失败。')) } finally { setSaving(false) }
  }
  const toggleDelivery = (id: string) => setDeliver(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  return <main ref={shellRef} className="app task-create-sheet"><header className="task-create-head"><button className="round-control" onClick={onClose} aria-label="关闭新建任务"><ArrowLeft size={18}/></button><span><b>新建任务</b><small>定时触发 Hermes 自动化执行</small></span><button className="round-control" onClick={onClose} aria-label="关闭新建任务"><X size={17}/></button></header><div className="task-create-scroll">
    <FormLabel title="基于模板" hint="选择内置模板或自定义配置任务。"><select value={template} onChange={event => setTemplate(event.target.value)}><option value="custom">自定义配置</option>{blueprints.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></FormLabel>
    <FormLabel title="归属智能体" hint="该任务将注册在该智能体的调度计划中。"><select value={bot} onChange={event => { const next = event.target.value; setBot(next); setDeliver(next ? [`bot-chat:${next}`] : []); setValues(current => ({ ...current, deliver: next ? `bot-chat:${next}` : '' })) }}>{profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.display_name || titleizeBot(profile.name)}</option>)}</select></FormLabel>
    {selectedBlueprint ? <section className="task-template-note"><b>{selectedBlueprint.title}</b><span>{selectedBlueprint.description}</span></section> : <><FormLabel title="任务名称" optional><input value={name} onChange={event => setName(event.target.value)} placeholder="如：每日早报汇总" /></FormLabel><FormLabel title="执行指令 (Prompt)" hint="到达设定计划周期时由 Hermes 自动执行的内容。"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="如：汇总今日重要待办与资讯，整理成要点清单…" /></FormLabel></>}
    {selectedBlueprint ? <section className="task-slot-section"><h3>模板选项</h3>{selectedBlueprint.fields.filter(field => field.name !== 'deliver').map(field => <FormLabel key={field.name} title={field.label} optional={field.optional} hint={field.help}><Slot field={field} value={values[field.name] || ''} onChange={value => setValues(current => ({ ...current, [field.name]: value }))}/></FormLabel>)}</section> : <FormLabel title="执行频率"><select value={frequency} onChange={event => { const next = event.target.value; setFrequency(next); const found = frequencies.find(item => item.id === next); if (found?.schedule) setSchedule(found.schedule) }}>{frequencies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>{frequency === 'custom' && <input className="schedule-input" value={schedule} onChange={event => setSchedule(event.target.value)} placeholder="0 9 * * * 或 weekdays at 9am" />}<small className="field-help">支持标准 Cron 表达式，或如 “every hour”、“weekdays at 9am” 等自然语言描述。</small></FormLabel>}
    <section className="task-form-section"><h3>结果投递至</h3><div className="task-delivery-list">{botDeliveryTargets.map(target => { const selected = selectedBlueprint ? (values.deliver || '').split(',').includes(target.id) : deliver.includes(target.id); return <label key={target.id}><input type="checkbox" checked={selected} onChange={() => selectedBlueprint ? setValues(current => ({ ...current, deliver: target.id })) : toggleDelivery(target.id)} /><span><b>{target.name}</b></span>{selected && <Check size={15}/>}</label> })}</div>{!botDeliveryTargets.length && <p className="management-error">当前没有可供投递的智能体。</p>}</section>
    {!selectedBlueprint && <FormLabel title="指定模型" optional><select value={modelChoice} onChange={event => setModelChoice(event.target.value)}><option value="">跟随全局默认模型</option>{modelOptionsFlat.map(option => <option key={`${option.provider}:${option.model}`} value={`${option.provider}:${option.model}`}>{option.label}</option>)}</select></FormLabel>}
    {error && <p className="management-error">{error}</p>}
  </div><footer className="task-create-footer"><button onClick={onClose}>取消</button><button className="create" disabled={saving || loading} onClick={() => void submit()}><Plus size={15}/>{saving ? '创建中…' : '创建任务'}</button></footer></main>
}
function FormLabel({ title, hint, optional, children }: { title: string; hint?: string; optional?: boolean; children: ReactNode }) { return <label className="task-form-label"><span>{title}{optional && <em>可选</em>}</span>{children}{hint && <small className="field-help">{hint}</small>}</label> }
function Slot({ field, value, onChange }: { field: AutomationBlueprint['fields'][number]; value: string; onChange: (value: string) => void }) { if (field.type === 'enum' || field.type === 'weekdays') return <select value={value} onChange={event => onChange(event.target.value)}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>; return <input type={field.type === 'time' ? 'time' : 'text'} value={value} onChange={event => onChange(event.target.value)} placeholder={field.help || field.label}/> }
