import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...inputs) => twMerge(clsx(inputs))
export const idOf = (value) => String(value?._id || value || '')
export const roleLabel = (name) => ({ System_Admin: 'System Admin', Owner: 'Owner', QA_Manager: 'QA Manager', Tester: 'Tester', Guest: 'Guest', User: 'User' }[name] || name || 'User')
export const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
