import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrainCircuit, Eye, EyeOff, LoaderCircle, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { authApi } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { Button, Input } from '@/components/ui'

export default function RegisterPage() {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  if (token) return <Navigate to="/dashboard" replace />

  const submit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!form.fullName.trim()) next.fullName = 'Họ và tên là bắt buộc.'
    if (!form.email.trim()) next.email = 'Email là bắt buộc.'
    if (form.password.length < 8) next.password = 'Mật khẩu cần tối thiểu 8 ký tự.'
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Xác nhận mật khẩu chưa khớp.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await authApi.register({ fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), password: form.password })
      toast.success('Đăng ký thành công. Hãy đăng nhập để bắt đầu.')
      navigate('/login')
    } catch (error) { toast.error(error.message) } finally { setLoading(false) }
  }

  return <main className="grid min-h-screen bg-white lg:grid-cols-[.9fr_1.1fr]"><section className="relative hidden overflow-hidden bg-[#171829] p-14 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -left-24 bottom-16 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" /><div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary"><BrainCircuit className="h-6 w-6" /></span><div><b>Enterprise Test Manager</b><p className="text-xs text-slate-400">AI Quality Core</p></div></div><div className="relative max-w-md"><span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-200">TEAM COLLABORATION</span><h1 className="mt-6 text-5xl font-bold leading-[1.08] tracking-tight">Tạo tài khoản để cùng kiểm thử.</h1><p className="mt-5 text-lg leading-8 text-slate-400">Đăng ký bằng email thật, sau đó nhận lời mời Workspace hoặc Project từ QA Manager.</p></div></section><section className="flex items-center justify-center p-6 sm:p-12"><form className="w-full max-w-md" onSubmit={submit}><div className="mb-9 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-white"><BrainCircuit className="h-6 w-6" /></span></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary"><UserPlus className="h-5 w-5" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-primary">Tài khoản ETMS</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Tạo tài khoản</h1><p className="mt-2 text-sm text-muted-foreground">Dùng email thật để nhận lời mời làm việc cùng nhóm.</p><div className="mt-7 space-y-4"><label className="block"><span className="label">Họ và tên</span><Input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} error={errors.fullName} placeholder="Nguyễn Văn A" autoComplete="name" />{errors.fullName && <p className="field-error">{errors.fullName}</p>}</label><label className="block"><span className="label">Email</span><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={errors.email} placeholder="ban@gmail.com" autoComplete="email" />{errors.email && <p className="field-error">{errors.email}</p>}</label><label className="block"><span className="label">Mật khẩu</span><div className="relative"><Input type={show ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} error={errors.password} placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>{errors.password && <p className="field-error">{errors.password}</p>}</label><label className="block"><span className="label">Xác nhận mật khẩu</span><Input type={show ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} error={errors.confirmPassword} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />{errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}</label><Button className="mt-2 h-12 w-full" disabled={loading}>{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Đang tạo tài khoản…' : 'Đăng ký'}</Button></div><p className="mt-6 text-center text-sm text-muted-foreground">Đã có tài khoản? <Link to="/login" className="font-semibold text-primary hover:underline">Đăng nhập</Link></p></form></section></main>
}
