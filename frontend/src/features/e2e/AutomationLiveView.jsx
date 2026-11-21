import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Button, Select } from '@/components/ui';

export default function AutomationLiveView({ executionId, runner, history = [] }) {
  const [selection, setSelection] = useState(''); const [attempt, setAttempt] = useState('');
  const [state, setState] = useState(null); const [frame, setFrame] = useState(''); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(false); const [browserHeight, setBrowserHeight] = useState(480);
  const section = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; section.current?.querySelector('button')?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setExpanded(false); }
      if (event.key === 'Tab') {
        const elements = [...section.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')].filter((item) => item.getClientRects().length);
        const first = elements[0]; const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard, true); requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); else section.current?.querySelector('[data-automation-expand]')?.focus(); }); };
  }, [expanded]);
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
  const content = <section ref={section} aria-label="Theo dõi Automation chỉ xem" className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden bg-slate-950 text-slate-100">
    <header className="shrink-0 space-y-2 border-b border-slate-700 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>Automation · Chỉ xem</strong><Button data-automation-expand variant="outline" size="sm" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Thu gọn màn hình' : 'Toàn màn hình'}</Button></div>
      <p className="text-xs text-slate-400">Runner tự thao tác. QA theo dõi và kết luận sau khi chạy; không điều khiển màn hình này.</p>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Select aria-label="Lịch sử Automation" className="col-span-2 min-w-0 max-w-full truncate text-slate-900 sm:col-span-1" value={selection} onChange={(event) => { setSelection(event.target.value); setAttempt(''); }}><option value="">Lượt hiện tại · {runner?.status || 'Chưa chạy'}</option>{history.filter((item) => item._id !== runner?._id).map((item) => <option value={item._id} key={item._id}>{new Date(item.createdAt).toLocaleString()} · {item.status}</option>)}</Select>
        <div className="col-span-2 flex min-w-0 flex-wrap gap-2 sm:col-span-1"><Select aria-label="Automation attempt" className="min-w-0 flex-1 basis-32 truncate text-slate-900" value={attempt} onChange={(event) => setAttempt(event.target.value)}><option value="">Attempt mới nhất</option>{Array.from({ length: selected?.attempt || 0 }, (_, index) => <option value={index + 1} key={index}>Attempt {index + 1}</option>)}</Select><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Kết nối lại</Button></div>
      </div>
      {!expanded && <label className="flex flex-wrap items-center gap-3 text-xs text-slate-400">Chiều cao trình duyệt<input aria-label="Chiều cao trình duyệt Automation" type="range" min="280" max="900" step="20" value={browserHeight} onChange={(event) => setBrowserHeight(Number(event.target.value))} /><span>{browserHeight}px</span></label>}
    </header>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-3">
      <div className="min-w-0 shrink-0 break-words">
        <p role="status" className="text-sm">{state?.status || runner?.status || 'Chưa chạy'} · Attempt {state?.attempt || runner?.attempt || '—'} · {progress?.activity || 'Chờ runner khởi tạo'}</p>
        {state?.percent !== undefined && <p className="mt-1 text-xs text-slate-400">Tiến trình job: {state.percent}% · theo giai đoạn thực thi</p>}
        <p className="mt-1 break-all text-xs text-slate-400">{progress?.url || ''}{state?.startedAt && ` · Bắt đầu ${new Date(state.startedAt).toLocaleTimeString()}`}{state?.completedAt && ` · Kết thúc ${new Date(state.completedAt).toLocaleTimeString()}`}</p>
        {error && <p className="mt-2 text-amber-300">{error}</p>}
      </div>
      <div className={expanded ? 'grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,1fr)]' : 'min-w-0 space-y-3'}>
        <div aria-label="Khung hình trình duyệt Automation" className={`flex min-w-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-black ${expanded ? 'h-full min-h-60' : ''}`} style={expanded ? undefined : { height: browserHeight }}>
          {frame ? <img src={frame} alt="Màn hình trình duyệt do Automation runner điều khiển" className="block h-full w-full min-w-0 max-w-full object-contain" /> : <p className="p-6 text-center text-sm text-slate-400">{!runner ? 'Chạy script đã duyệt để bắt đầu.' : 'Chờ hình ảnh Chromium. Profile tùy chỉnh và engine khác vẫn có kết quả/evidence, chưa có live view.'}</p>}
        </div>
        <div className={`grid min-w-0 gap-3 ${expanded ? 'min-h-0 content-start overflow-y-auto' : 'lg:grid-cols-2'}`}>
          <div className="min-w-0 rounded border border-slate-700 p-3"><h3 className="mb-2 text-sm font-semibold">Tiến trình runner</h3><ol className="max-h-48 overflow-x-hidden overflow-y-auto break-words text-xs">{progress?.events?.map((item, index) => <li className="py-1" key={index}>{new Date(item.at).toLocaleTimeString()} · {item.activity}</li>)}</ol></div>
          <div className="min-w-0 rounded border border-slate-700 p-3"><h3 className="mb-2 text-sm font-semibold">Assertions</h3><ul className="max-h-48 overflow-x-hidden overflow-y-auto break-words text-xs">{progress?.assertions?.map((item) => <li key={item.number} className="py-1">#{item.number} · {item.status} · {item.duration} ms</li>)}</ul></div>
        </div>
      </div>
      <details className="min-w-0 shrink-0 break-words text-xs text-slate-400"><summary>Giải thích trạng thái kết quả</summary><p className="mt-2">Failed: assertion không khớp, cần QA xác nhận nguyên nhân. Error: lỗi script/dữ liệu/môi trường. Retest tạo lượt mới và giữ lịch sử; evidence vẫn nằm trong Test Run.</p></details>
    </div>
  </section>;
  return expanded ? createPortal(<div role="dialog" aria-modal="true" aria-label="Màn hình Automation mở rộng" className="fixed inset-0 z-[120] min-w-0 bg-slate-950">{content}</div>, document.body) : content;
}
