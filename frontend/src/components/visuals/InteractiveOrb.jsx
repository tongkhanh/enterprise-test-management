import { useState } from 'react'

// CSS 3D deliberately replaces a heavyweight canvas here: it is interactive,
// respects reduced-motion, and never intercepts a form control or API request.
export default function InteractiveOrb() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const move = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    setTilt({ x: ((event.clientY - bounds.top) / bounds.height - 0.5) * -16, y: ((event.clientX - bounds.left) / bounds.width - 0.5) * 18 })
  }
  return <div aria-hidden="true" className="orb-stage" onMouseMove={move} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
    <div className="orb-scene" style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
      <span className="orb-core" /><span className="orb-ring orb-ring-a" /><span className="orb-ring orb-ring-b" /><span className="orb-ring orb-ring-c" />
    </div>
  </div>
}
