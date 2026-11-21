import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Button, Select } from '@/components/ui';

export default function AutomationLiveView({ executionId, runner, history = [] }) {
  const [selection, setSelection] = useState(''); const [attempt, setAttempt] = useState('');
  const [state, setState] = useState(null); const [frame, setFrame] = useState(''); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const selected = history.find((item) => item._id === selection) || runner;
  useEffect(() => {
    setState(null); setFrame(''); setError('');
    if (!selected?._id) return;
    const controller = new AbortController(); let alive = true;
    (async () => {
      const token = useAuthStore.getState().token || localStorage.getItem('etms_token');
      const params = new URLSearchParams({ run: selected._id }); if (attempt) params.set('attempt', attempt);
      const endpoint = executionId ? `/test-executions/${executionId}/automation-live` : `/automation-runs/${selected._id}/live`;
      const response = await fetch(`${api.defaults.baseURL}${endpoint}?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) throw new Error('Không tải được màn hình runner. Thử kết nối lại.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (!controller.signal.aborted) {
        const value = await reader.read(); if (value.done) break;
        buffer += decoder.decode(value.value, { stream: true }); let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const type = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!raw || !alive) continue; const data = JSON.parse(raw);
          if (type === 'state') setState(data);
          if (type === 'frame') setFrame(`data:image/jpeg;base64,${data.data}`);
        }
      }
    })().catch((value) => { if (alive && !controller.signal.aborted) setError(value.message); });
    return () => { alive = false; controller.abort(); };
  }, [executionId, selected?._id, attempt, revision]);
  const progress = state?.progress;
  return <section aria-label="Theo dõi Automation chỉ xem" className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
    <header className="space-y-2 border-b border-slate-700 p-3"><strong>Automation · Chỉ xem</strong><p className="text-xs text-slate-400">Runner tự thao tác. QA theo dõi và kết luận sau khi chạy; không điều khiển màn hình này.</p><div className="flex flex-wrap gap-2"><Select aria-label="Lịch sử Automation" className="min-w-0 flex-1 text-slate-900" value={selection} onChange={(event) => { setSelection(event.target.value); setAttempt(''); }}><option value="">Lượt hiện tại · {runner?.status || 'Chưa chạy'}</option>{history.filter((item) => item._id !== runner?._id).map((item) => <option value={item._id} key={item._id}>{new Date(item.createdAt).toLocaleString()} · {item.status}</option>)}</Select><Select aria-label="Automation attempt" className="w-40 text-slate-900" value={attempt} onChange={(event) => setAttempt(event.target.value)}><option value="">Attempt mới nhất</option>{Array.from({ length: selected?.attempt || 0 }, (_, index) => <option value={index + 1} key={index}>Attempt {index + 1}</option>)}</Select><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Kết nối lại</Button></div></header>
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <p role="status" className="mb-2 text-sm">{state?.status || runner?.status || 'Chưa chạy'} · Attempt {state?.attempt || runner?.attempt || '—'} · {progress?.activity || 'Chờ runner khởi tạo'}</p>
      {state?.percent !== undefined && <p className="mb-2 text-xs text-slate-400">Tiến trình job: {state.percent}% · theo giai đoạn thực thi</p>}
      <p className="mb-2 break-all text-xs text-slate-400">{progress?.url || ''}{state?.startedAt && ` · Bắt đầu ${new Date(state.startedAt).toLocaleTimeString()}`}{state?.completedAt && ` · Kết thúc ${new Date(state.completedAt).toLocaleTimeString()}`}</p>
      {error && <p className="my-2 text-amber-300">{error}</p>}
      {frame ? <img src={frame} alt="Màn hình trình duyệt do Automation runner điều khiển" className="w-full rounded border border-slate-700" /> : <div className="rounded border border-slate-700 p-12 text-center text-sm text-slate-400">{!runner ? 'Chạy script đã duyệt để bắt đầu.' : 'Chờ hình ảnh Chromium. Profile tùy chỉnh và engine khác vẫn có kết quả/evidence, chưa có live view.'}</div>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2"><div className="rounded border border-slate-700 p-3"><h3 className="mb-2 text-sm font-semibold">Tiến trình runner</h3><ol className="max-h-52 overflow-auto text-xs">{progress?.events?.map((item, index) => <li className="py-1" key={index}>{new Date(item.at).toLocaleTimeString()} · {item.activity}</li>)}</ol></div><div className="rounded border border-slate-700 p-3"><h3 className="mb-2 text-sm font-semibold">Assertions</h3><ul className="max-h-52 overflow-auto text-xs">{progress?.assertions?.map((item) => <li key={item.number} className="py-1">#{item.number} · {item.status} · {item.duration} ms</li>)}</ul></div></div>
      <p className="mt-3 text-xs text-slate-400">Failed: assertion không khớp, cần QA xác nhận nguyên nhân. Error: lỗi script/dữ liệu/môi trường. Retest tạo lượt mới và giữ lịch sử; evidence vẫn nằm trong Test Run.</p>
    </div>
  </section>;
}
