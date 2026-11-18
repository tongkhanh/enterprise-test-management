import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...inputs) => twMerge(clsx(inputs))
export const idOf = (value) => String(value?._id || value || '')
export const roleLabel = (name) => ({ System_Admin: 'System Admin', Owner: 'Business Owner', Business_Owner: 'Business Owner', Product_Owner: 'Business Owner', Business_Analyst: 'Business Owner', QA: 'QA', QA_Manager: 'QA', Tester: 'QA', Guest: 'Guest', User: 'User' }[name] || name || 'User')
export const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
