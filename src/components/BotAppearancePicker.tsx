import { Dice5, LockKeyhole } from 'lucide-react'

import { canonicalProfileAvatarSvg } from '../avatar-render'

const blobKinds: Array<[string, string]> = [
  ['round', '圆润'],
  ['organic', '自然'],
  ['boxy', '方形'],
  ['capsule', '胶囊'],
  ['nub', '萌芽'],
  ['cloud', '云朵'],
  ['droplet', '水滴'],
  ['hexagon', '六棱'],
  ['sun', '日光'],
  ['triangle', '三角']
]

type Props = {
  name: string
  shape: string
  onShape: (shape: string) => void
}

const shapeForKind = (seed: string, kind: string) => kind ? `blobatar:${seed}:${kind}` : seed ? `blobatar:${seed}` : 'blobatar'
const randomSeed = () => Math.random().toString(36).slice(2, 10)

export function BotAppearancePicker({ name, shape, onShape }: Props) {
  const preview = canonicalProfileAvatarSvg(name || 'agent', shape)
  const locked = shape.split(':')[1] || ''
  const currentKind = shape.split(':')[2] || ''

  return <section className="appearance-picker">
    <div className="appearance-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: preview }}/>
    <div><b>跨端矢量化身 (Blobatar)</b><p>相同的生成种子、轮廓与调色方案将在桌面端、智能体卡片、会话列表及聊天中保持完全一致。</p></div>
    <div className="appearance-grid"><button className={!currentKind ? 'selected' : ''} onClick={() => onShape(shapeForKind(locked, ''))}><span>自适应</span></button>{blobKinds.map(([kind, label]) => <button title={label} className={currentKind === kind ? 'selected' : ''} key={kind} onClick={() => onShape(shapeForKind(locked, kind))}><span aria-hidden="true" dangerouslySetInnerHTML={{ __html: canonicalProfileAvatarSvg(name || 'agent', shapeForKind(locked, kind)) }}/><small>{label}</small></button>)}</div>
    <div className="appearance-actions"><button type="button" onClick={() => onShape(`blobatar:${randomSeed()}:${currentKind || 'round'}`)}><Dice5 size={15}/> 随机表情</button><span>{locked ? <><LockKeyhole size={13}/> 表情已锁定</> : '表情跟随智能体名称自适应生成。'}</span></div>
  </section>
}
