import { useEffect, useId, useRef } from 'react'
import * as THREE from 'three'

const palette = [0x8b5cf6, 0x38bdf8, 0xf472b6, 0xf59e0b, 0x10b981, 0xef4444, 0x6366f1, 0x14b8a6, 0xa855f7, 0x0ea5e9, 0xfb7185, 0x84cc16, 0xf97316, 0x22c55e, 0x06b6d4, 0xe879f9, 0x818cf8, 0xfacc15, 0x2dd4bf, 0xf43f5e, 0x60a5fa, 0xc084fc, 0x34d399]
const variantFor = (id) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length

// A deliberately tiny WebGL scene. It pauses off-screen and owns no API/state.
export default function CardScene() {
  const host = useRef(null); const identity = useId(); const variant = variantFor(identity)
  useEffect(() => {
    const element = host.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100); camera.position.set(0, 0, 6)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35)); element.appendChild(renderer.domElement)
    const group = new THREE.Group(); scene.add(group)
    const material = new THREE.MeshPhysicalMaterial({ color: palette[variant], metalness: 0.18, roughness: 0.2, transmission: 0.2, transparent: true, opacity: 0.72, clearcoat: 0.8 })
    const wire = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22 })
    if (variant === 0) { group.add(new THREE.Mesh(new THREE.TorusKnotGeometry(1.05, .27, 90, 12), material)); group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.65, 1), wire)) }
    if (variant === 1) { [-.55, 0, .55].forEach((y, index) => { const box = new THREE.Mesh(new THREE.BoxGeometry(1.75 - index * .16, .34, 1.25 - index * .12), material.clone()); box.position.y = y; box.rotation.y = index * .22; group.add(box) }) }
    if (variant === 2) { group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.16, 2), material)); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, .04, 8, 80), new THREE.MeshBasicMaterial({ color: palette[(variant + 1) % palette.length], transparent: true, opacity: .7 })); ring.rotation.x = 1.05; group.add(ring) }
    if (variant === 3) { group.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.32, 1), material)); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, .09, 12, 60), material.clone()); ring.rotation.x = .95; group.add(ring) }
    if (variant === 4) { [-.65, 0, .65].forEach((x, index) => { const crystal = new THREE.Mesh(new THREE.DodecahedronGeometry(.52 + index * .12, 0), material.clone()); crystal.position.set(x, index === 1 ? .12 : -.18, index * .12); crystal.rotation.set(index, index * .6, .2); group.add(crystal) }); group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 1), wire)) }
    if (variant === 5) { [0, .58, 1.16].forEach((rotation, index) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16 + index * .18, .075, 10, 70), material.clone()); ring.rotation.set(rotation, rotation * 1.7, index * .4); group.add(ring) }); const core = new THREE.Mesh(new THREE.SphereGeometry(.37, 22, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .86 })); group.add(core) }
    if (variant === 6) { [-.58, -.15, .28, .7].forEach((y, index) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(.95 - index * .13, .3, 4), material.clone()); cone.position.y = y; cone.rotation.y = index * .38; group.add(cone) }); group.add(new THREE.Mesh(new THREE.TorusGeometry(1.42, .035, 8, 60), wire)) }
    if (variant === 7) { const core = new THREE.Mesh(new THREE.TetrahedronGeometry(.85, 1), material); group.add(core); [0, 1, 2, 3].forEach((index) => { const satellite = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), new THREE.MeshBasicMaterial({ color: palette[(variant + index + 1) % palette.length] })); const angle = index * Math.PI / 2; satellite.position.set(Math.cos(angle) * 1.42, Math.sin(angle) * 1.05, index % 2 ? .42 : -.3); group.add(satellite) }); const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.52, .025, 8, 70), wire); orbit.rotation.x = 1.1; group.add(orbit) }
    if (variant >= 8) {
      const factories = [
        () => new THREE.CapsuleGeometry(.58, 1.24, 8, 16), () => new THREE.TorusGeometry(1.02, .26, 12, 70), () => new THREE.CylinderGeometry(.52, 1.05, 1.45, 6), () => new THREE.SphereGeometry(1.06, 20, 15, 0, Math.PI * 1.55), () => new THREE.ConeGeometry(1.02, 1.8, 5, 1), () => new THREE.DodecahedronGeometry(1.06, 1), () => new THREE.TorusKnotGeometry(.88, .18, 62, 9, 3, 5), () => new THREE.IcosahedronGeometry(1.2, 1), () => new THREE.OctahedronGeometry(1.27, 2), () => new THREE.TetrahedronGeometry(1.38, 2), () => new THREE.BoxGeometry(1.48, 1.48, 1.48, 2, 2, 2), () => new THREE.CylinderGeometry(.18, 1.2, 1.55, 3), () => new THREE.TorusGeometry(.86, .38, 7, 50), () => new THREE.SphereGeometry(1.05, 18, 12), () => new THREE.ConeGeometry(.92, 1.65, 8, 2),
      ]
      const offset = variant - 8; const primary = new THREE.Mesh(factories[offset](), material); primary.rotation.set(offset * .21, offset * .36, offset * .12); group.add(primary)
      if (offset % 2 === 0) { const halo = new THREE.Mesh(new THREE.TorusGeometry(1.48, .035, 8, 64), new THREE.MeshBasicMaterial({ color: palette[(variant + 3) % palette.length], transparent: true, opacity: .72 })); halo.rotation.set(.7 + offset * .08, offset * .24, 0); group.add(halo) }
      if (offset % 3 === 1) [-1, 1].forEach((side) => { const gem = new THREE.Mesh(new THREE.TetrahedronGeometry(.22, 0), material.clone()); gem.position.set(side * 1.3, .42, side * .24); group.add(gem) })
      if (offset % 4 === 2) { const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.56, 1), wire); shell.rotation.y = .45; group.add(shell) }
    }
    scene.add(new THREE.HemisphereLight(0xffffff, palette[variant], 2.5)); const light = new THREE.PointLight(0xffffff, 22, 14); light.position.set(2, 3, 4); scene.add(light)
    let frame; let shown = true; let size = { width: 1, height: 1 }; const clock = new THREE.Clock()
    const resize = () => { const rect = element.getBoundingClientRect(); size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) }; camera.aspect = size.width / size.height; camera.updateProjectionMatrix(); renderer.setSize(size.width, size.height, false) }
    const draw = () => { if (!shown) return; const t = clock.getElapsedTime(); group.rotation.y = t * .38; group.rotation.x = Math.sin(t * .55) * .22; group.position.y = Math.sin(t * .8) * .16; renderer.render(scene, camera); frame = requestAnimationFrame(draw) }
    const observer = new IntersectionObserver(([entry]) => { shown = entry.isIntersecting; if (shown && !frame) { clock.start(); draw() } }, { threshold: .04 }); observer.observe(element); resize(); draw(); const watcher = new ResizeObserver(resize); watcher.observe(element)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); watcher.disconnect(); group.traverse((object) => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose()); else object.material?.dispose() }); renderer.dispose(); renderer.domElement.remove() }
  }, [variant])
  return <div ref={host} aria-hidden="true" className="card-scene" />
}
