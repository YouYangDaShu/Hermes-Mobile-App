import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, GitBranch, Globe2, Heart, LoaderCircle, LockKeyhole, ShieldCheck, Smartphone, Wifi } from 'lucide-react'

import HermesMobileAboutMark from '../assets/HermesMobileAboutMark.png'
import { errorMessage, supportsBasicAuth } from '../connection-state'
import { useEdgeSwipeBack } from '../edge-swipe'
import { nativeSignIn, passwordSignIn, probeHermesGateway } from '../hermes'

const HermesMobileLogo = HermesMobileAboutMark

type Theme = 'dark' | 'light' | 'grey' | 'aurora'
type Page = 'root' | 'pairing' | 'about'

type Props = {
  profiles: number
  sessions: number
  connected: boolean
  endpoint?: string
  theme: Theme
  setTheme: (theme: Theme) => void
  close: () => void
  refresh: () => Promise<unknown>
  onPairingBusy: (busy: boolean) => void
  onPaired: (endpoint: string) => Promise<void>
}

const themes: Array<{ id: Theme; label: string; description: string }> = [
  { id: 'dark', label: 'OLED 纯黑', description: '深邃极夜配微紫点缀' },
  { id: 'light', label: '浅色', description: '层次分明的冷灰蓝面板' },
  { id: 'grey', label: '石墨灰', description: '极简中性灰质感' },
  { id: 'aurora', label: '极光', description: '深海夜空配青紫流光' },
]

const external = (href: string) => ({ href, onClick: (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); void invoke('open_external_url', { url: href }).catch(() => window.open(href, '_blank', 'noopener,noreferrer')) } })

function Header({ title, subtitle, back, compact = false }: { title: string; subtitle: string; back: () => void; compact?: boolean }) {
  return <header className={`panel-head connection-head${compact ? ' compact' : ''}`}>
    <button className="back-button" onClick={back} aria-label="返回"><ArrowLeft size={19}/></button>
    {!compact && <div><h2>{title}</h2><p>{subtitle}</p></div>}
  </header>
}

function AboutHermesMobile({ back }: { back: () => void }) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, back)
  return <main ref={shellRef} className="app panel about-screen">
    <Header title="" subtitle="" back={back} compact/>
    <section className="about-hero">
      <div className="about-logo-card"><img src={HermesMobileLogo} alt="Hermes Mobile 徽标"/></div>
      <h1>Hermes 移动端</h1>
      <p className="about-meta">Hermes Agent 随身控制台 <i aria-hidden="true">|</i> 版本 0.1.1</p>
      <span>随时随地掌握你的 Hermes Agent 工作空间。</span>
    </section>
    <section className="about-story">
      <p>Hermes 赋予了 Agent 强大的自主行动与工具调用能力。本应用专为移动端打造，让你在手机上即可高效掌控与调度所有的 Hermes 智能体。</p>
      <p>你的主机与服务器始终是模型、凭证、审批、工具、上下文记忆与文件的核心掌管者；Hermes 移动端则是随身的一体化控制台。</p>
      <p className="about-signoff">- 原作者 <a {...external('https://stestein.com/')}>SteStein.com</a> · 幽羊团队汉化与定制</p>
    </section>
    <section className="about-links" aria-label="相关链接">
      <p>HERMES 移动端</p>
      <a {...external('https://github.com/CodeUpdaterBot/Hermes-Mobile-App')}><GitBranch size={18}/><span><b>Hermes Mobile 官方仓库</b><small>源码、版本发布与反馈</small></span><ExternalLink size={16}/></a>
      <p>HERMES ECOSYSTEM</p>
      <a {...external('https://hermes-agent.nousresearch.com/')}><Globe2 size={18}/><span><b>Hermes Agent 官网</b><small>权威站点</small></span><ExternalLink size={16}/></a>
      <a {...external('https://hermes-agent.nousresearch.com/docs/')}><Globe2 size={18}/><span><b>开发文档</b><small>网关、工具与智能体指南</small></span><ExternalLink size={16}/></a>
      <a {...external('https://github.com/NousResearch/hermes-agent')}><GitBranch size={18}/><span><b>Hermes Agent GitHub</b><small>开源 Agent 运行时</small></span><ExternalLink size={16}/></a>
      <a {...external('https://discord.gg/NousResearch')}><Heart size={18}/><span><b>Nous Research Discord</b><small>社区与技术支持</small></span><ExternalLink size={16}/></a>
    </section>
    <p className="about-footer">基于 Nous Research 开源生态打造的社区独立移动客户端。</p>
  </main>
}

function PairingSettings({ back, onPaired, onPairingBusy, initialEndpoint }: { back: () => void; onPaired: (endpoint: string) => Promise<void>; onPairingBusy: (busy: boolean) => void; initialEndpoint?: string }) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, back)
  const [gatewayUrl, setGatewayUrl] = useState(initialEndpoint || '')
  const [checking, setChecking] = useState(false)
  const [verifiedEndpoint, setVerifiedEndpoint] = useState<string | null>(null)
  const [passwordAuth, setPasswordAuth] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const probeEpochRef = useRef(0)
  const testGateway = async () => {
    const value = gatewayUrl.trim().replace(/\/$/, '')
    if (!value) { setResult({ tone: 'error', text: '请先输入 Hermes 网关地址（内网 IP、Tailscale 或 HTTPS 域名）。' }); return }
    const probeEpoch = ++probeEpochRef.current
    setChecking(true); setResult(null); setVerifiedEndpoint(null); setPasswordAuth(false); setPassword('')
    try {
      const status = await probeHermesGateway(value)
      if (probeEpoch !== probeEpochRef.current) return
      const host = new URL(value).hostname.toLowerCase()
      const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
      if (!loopback && status.auth_required !== true) {
        setResult({ tone: 'error', text: '该远程网关可达但未开启鉴权认证。为了安全，公网连接建议开启鉴权。' })
        return
      }
      const supportsPassword = supportsBasicAuth(status.auth_providers)
      setPasswordAuth(supportsPassword)
      const pkce = status.auth_flows?.includes('native_pkce') ? ' 支持原生设备安全登录。' : ''
      if (!status.auth_flows?.includes('native_pkce')) throw new Error('该网关未启用支持移动端原生鉴权的流程。')
      setVerifiedEndpoint(value)
      setResult({ tone: 'success', text: `Hermes 网关 (${status.version || '服务'}) 连接成功。${pkce}` })
    } catch (error) {
      if (probeEpoch === probeEpochRef.current) setResult({ tone: 'error', text: errorMessage(error, '无法连接至该 Hermes 网关。') })
    } finally { if (probeEpoch === probeEpochRef.current) setChecking(false) }
  }
  const completeSignIn = async () => {
    if (!verifiedEndpoint) return
    onPairingBusy(true)
    setSigningIn(true); setResult(null)
    try {
      if (passwordAuth) await passwordSignIn(verifiedEndpoint, username.trim(), password)
      else await nativeSignIn(verifiedEndpoint)
      await new Promise(resolve => window.setTimeout(resolve, 150))
      setPassword('')
      await onPaired(verifiedEndpoint)
      back()
    } catch (error) { setResult({ tone: 'error', text: errorMessage(error, 'Hermes 安全登录失败。') }) }
    finally { setPassword(''); setSigningIn(false); onPairingBusy(false) }
  }
  const copyChecklist = async () => {
    try {
      await navigator.clipboard.writeText('Hermes 移动端配对指南\n1. 确保服务端已启动 hermes serve\n2. 手机与主机保持同一局域网，或通过 FRP 穿透与 HTTPS 反代提供公网连接\n3. 在手机端输入网关地址（如 https://hermes.youyangai.top），切勿填写 127.0.0.1\n4. 点击测试网关连通性，并通过凭证完成鉴权握手\n5. 握手成功后即可随时随地管理智能体与会话')
      setCopied(true); window.setTimeout(() => setCopied(false), 1800)
    } catch { setResult({ tone: 'error', text: '剪贴板访问受限，请直接参考下方配置步骤。' }) }
  }
  return <main ref={shellRef} className="app panel pairing-screen">
    <Header title="安全与配对" subtitle="为移动设备配置安全网关与访问权限" back={back}/>
    <section className="pairing-hero">
      <div className="pairing-icon"><ShieldCheck size={28}/></div>
      <div><span>推荐配置</span><h3>远程网关与穿透</h3><p>保持 Hermes 网关安全。可通过私有内网、Tailscale 或 FRP + HTTPS 反代安全连接，避免直接在公网裸奔未加密端口。</p></div>
    </section>
    <section className="pairing-card">
      <div className="pairing-card-title"><Wifi size={18}/><div><b>验证 Hermes 网关</b><small>在连接与登录前检测 Hermes 服务的真实在线状态。</small></div></div>
      <label className="pairing-field"><span>网关地址 (GATEWAY URL)</span><input value={gatewayUrl} onChange={event => { setGatewayUrl(event.target.value); probeEpochRef.current += 1; setVerifiedEndpoint(null); setPasswordAuth(false); setPassword('') }} placeholder="https://hermes.youyangai.top 或 http://192.168.x.x:9119" inputMode="url" autoCapitalize="none" autoCorrect="off"/></label>
      <button className="primary wide pairing-test" disabled={checking || signingIn} aria-busy={checking} onClick={() => void testGateway()}>{checking ? <><LoaderCircle className="pairing-spinner" size={17}/> 正在检测网关…</> : <>测试网关连通性</>}</button>
      {verifiedEndpoint && passwordAuth && <div className="pairing-credentials">
        <label className="pairing-field"><span>用户名 (USERNAME)</span><input value={username} onChange={event => setUsername(event.target.value)} placeholder="Hermes 网关用户名" autoCapitalize="none" autoCorrect="off" autoComplete="username"/></label>
        <label className="pairing-field"><span>密码 (PASSWORD)</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Hermes 网关密码" autoComplete="current-password"/></label>
        <p className="pairing-note">仅在换取受控访问令牌时使用一次，明文密码不会保存在本地。</p>
      </div>}
      {verifiedEndpoint && <button className="secondary wide pairing-signin" disabled={signingIn || (passwordAuth && (!username.trim() || !password))} aria-busy={signingIn} onClick={() => void completeSignIn()}>{signingIn ? <><LoaderCircle className="pairing-spinner" size={17}/> 正在登录并连接…</> : <>{passwordAuth ? '登录并连接' : '继续完成安全连接'}</>}</button>}
      {result && <p className={`pairing-result ${result.tone}`}>{result.tone === 'success' ? <CheckCircle2 size={16}/> : <LockKeyhole size={16}/>}<span>{result.text}</span></p>}
      <p className="pairing-note">提示：切勿在手机上输入 <code>127.0.0.1</code> 或 <code>localhost</code>，那会指向手机自身。请填写局域网 IP 或公网反代域名。</p>
    </section>
    <section className="pairing-steps">
      <p>连接步骤</p>
      <ol>
        <li><Smartphone size={17}/><span><b>网络连通</b><small>手机与主机处于同一 Wi-Fi，或通过 FRP 穿透与 HTTPS 反代提供外部访问。</small></span></li>
        <li><Wifi size={17}/><span><b>运行 Hermes 服务</b><small>主机端运行 hermes serve，支持 WebSocket 与 REST API 握手。</small></span></li>
        <li><LockKeyhole size={17}/><span><b>安全握手验证</b><small>输入网关地址及凭证，App 换取受控令牌并安全存入移动端密钥库。</small></span></li>
      </ol>
    </section>
    <section className="pairing-actions">
      <button className="secondary" onClick={() => void copyChecklist()}>{copied ? <CheckCircle2 size={16}/> : <Copy size={16}/>} {copied ? '已复制配置清单' : '复制配置清单'}</button>
      <a {...external('https://hermes-agent.nousresearch.com/docs/user-guide/multi-connection-desktop')}><ExternalLink size={16}/> 网关连接官方文档</a>
    </section>
    <p className="pairing-disclosure">Hermes 移动端会先检测端点可达性，通过受保护协议换取会话令牌，并在通过 REST 与 WebSocket 双重握手后建立实时双向通信。</p>
  </main>
}

export function ConnectionSettings({ profiles, sessions, connected, endpoint, theme, setTheme, close, refresh, onPairingBusy, onPaired }: Props) {
  const shellRef = useRef<HTMLElement>(null)
  useEdgeSwipeBack(shellRef, close, true)
  const [page, setPage] = useState<Page>('root')
  const [showThemes, setShowThemes] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  useEffect(() => {
    const onMobileBack = (event: Event) => {
      if (page === 'root') return
      event.preventDefault()
      setPage('root')
    }
    window.addEventListener('hermes-mobile-back', onMobileBack)
    return () => window.removeEventListener('hermes-mobile-back', onMobileBack)
  }, [page])
  const syncNow = async () => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    try {
      const result = await refresh()
      setSyncState(result ? 'success' : 'error')
    } catch {
      setSyncState('error')
    }
  }
  if (page === 'about') return <AboutHermesMobile back={() => setPage('root')}/>
  if (page === 'pairing') return <PairingSettings back={() => setPage('root')} onPaired={onPaired} onPairingBusy={onPairingBusy} initialEndpoint={endpoint}/>
  const displayEndpoint = endpoint?.replace(/^https?:\/\//, '')
  return <main ref={shellRef} className="app panel connection-screen">
    <Header title="连接设置" subtitle="Hermes 主控服务" back={close}/>
    <section className={`connection-card ${connected ? 'connected' : 'unpaired'}`}>
      <span className={`status-pill ${connected ? '' : 'disconnected'}`}>● {connected ? '已连接' : '未连接'}</span>
      <h3>{connected ? '当前 Hermes 主控' : endpoint ? '已保存的端点需要检查' : '配对新设备'}</h3>
      <code>{displayEndpoint || '暂无已验证的主控地址'}</code>
      {connected ? <div className="stats"><span><b>{profiles}</b>智能体</span><span><b>{sessions}</b>会话</span></div> : <p className="connection-guidance">{endpoint ? '已保存主控地址与登录凭证。可点击下方重试验证；无需重新输入。' : '在手机查看与调度智能体前，请先连接至可访问且经鉴权的 Hermes 网关。'}</p>}
      <button className={`primary wide connection-sync-button ${syncState}`} disabled={connected && syncState === 'syncing'} aria-busy={connected && syncState === 'syncing'} onClick={connected ? () => void syncNow() : endpoint ? () => void refresh() : () => setPage('pairing')}>{connected ? syncState === 'syncing' ? <><LoaderCircle className="connection-sync-spinner" size={17}/> 正在同步…</> : syncState === 'success' ? <><CheckCircle2 size={17}/> 同步完成</> : '立即同步' : endpoint ? '重试已保存的连接' : '配置连接与配对'}</button>
      {connected && syncState !== 'idle' && <p className={`connection-sync-result ${syncState}`} role="status">{syncState === 'syncing' ? '正在刷新实时 Hermes 数据…' : syncState === 'success' ? '刚刚已与 Hermes 主控同步完成。' : '同步未能完成，请检查网关连接后重试。'}</p>}
    </section>
    <section className="menu-list"><button>通知设置 <span>›</span></button><button onClick={() => setShowThemes(value => !value)}>外观主题 <span>{themes.find(item => item.id === theme)?.label} ›</span></button>{showThemes && <div className="theme-picker">{themes.map(item => <button className={item.id === theme ? 'selected' : ''} onClick={() => setTheme(item.id)} key={item.id}><span className={`theme-swatch theme-${item.id}`}/><span><b>{item.label}</b><small>{item.description}</small></span><i>{item.id === theme ? '✓' : ''}</i></button>)}</div>}<button onClick={() => setPage('pairing')}>安全与配对 <span className={connected ? '' : 'connection-attention'}>{connected ? '已连接 ›' : '未连接 ›'}</span></button><button onClick={() => setPage('about')}>关于 Hermes 移动端 <span>0.1.1 ›</span></button></section>
    <p className="fine">主控端负责驱动模型、凭证、工具调用、记忆与技能。移动客户端作为远程交互面板。</p>
  </main>
}
