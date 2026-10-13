import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '@/lib/utils'
import InteractiveOrb from '@/components/visuals/InteractiveOrb'

export default function AppLayout() {
  const [menu, setMenu] = useState(false); const [collapsed, setCollapsed] = useState(false)
  return <div className="app-mesh min-h-screen"><Sidebar open={menu} onClose={() => setMenu(false)} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} /><div className={cn('relative min-h-screen transition-[margin] duration-300', collapsed ? 'lg:ml-[68px]' : 'lg:ml-[236px]')}><Header onMenu={() => setMenu(true)} /><div className="fixed bottom-4 right-4 z-20 hidden scale-[.62] rounded-3xl border border-white/60 bg-white/35 p-1 opacity-80 shadow-xl backdrop-blur-xl transition hover:scale-75 hover:opacity-100 2xl:block dark:border-white/10 dark:bg-slate-950/20"><InteractiveOrb /></div><main className="relative z-10 mx-auto w-full max-w-[1680px] p-4 sm:p-5 lg:p-6"><Outlet /></main></div></div>
}
