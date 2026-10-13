import { Construction } from 'lucide-react'
import { Card } from '@/components/ui'
export default function PlaceholderPage({ title }) { return <Card className="grid min-h-[520px] place-items-center p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary"><Construction className="h-6 w-6" /></span><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Phân hệ này đã có vị trí trong kiến trúc React và sẽ được triển khai ở giai đoạn tiếp theo.</p></div></Card> }
