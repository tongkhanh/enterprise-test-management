import { useState } from 'react'
import { Boxes, Sparkles } from 'lucide-react'

export default function E2EVisualHero() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const move = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    setTilt({ x: ((event.clientY - box.top) / box.height - 0.5) * -12, y: ((event.clientX - box.left) / box.width - 0.5) * 16 })
  }
  return <section className="e2e-visual-hero" onPointerMove={move} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
    <div className="e2e-mesh e2e-mesh-one" /><div className="e2e-mesh e2e-mesh-two" /><div className="e2e-grid-light" />
    <div className="relative z-10 max-w-xl p-6 sm:p-8"><div className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-white backdrop-blur"><Sparkles className="h-3.5 w-3.5" />Quality orchestration</div><h1 className="mt-5 text-3xl font-bold tracking-[-.045em] text-white sm:text-4xl">Một luồng E2E.<br />Một không gian điều khiển.</h1><p className="mt-3 max-w-md text-sm leading-6 text-violet-100">Di chuyển chuột trên nền để điều khiển phối cảnh 3D. Các node bên dưới là những điểm chuyển bước thực tế của workflow.</p></div>
    <div className="e2e-3d-stage" aria-hidden="true"><div className="e2e-3d-world" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}><div className="e2e-cube"><i /><i /><i /><i /><i /><i /></div><div className="e2e-orbit e2e-orbit-one" /><div className="e2e-orbit e2e-orbit-two" /><div className="e2e-glass-chip chip-one"><Boxes className="h-5 w-5" /></div><div className="e2e-glass-chip chip-two">E2E</div><div className="e2e-glass-chip chip-three">AI</div></div></div>
  </section>
}
