import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, executionApi } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Select } from '@/components/ui';

export default function RemoteManualBrowser({ executionId, onEvidence }) {
  const canvas = useRef(null); const stream = useRef(null); const pending = useRef([]); const timer = useRef(null); const sending = useRef(false);
  const alive = useRef(false); const lastMove = useRef(0); const generation = useRef(0);
  const control = useRef(null); const acknowledgement = useRef(null); const sequence = useRef(0);
  const [phase, setPhase] = useState('starting'); const [message, setMessage] = useState('Đang mở trình duyệt riêng…');
  const [state, setState] = useState({ tabs: [], url: '' }); const [address, setAddress] = useState(''); const [dialog, setDialog] = useState(null); const [dialogText, setDialogText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [insertText, setInsertText] = useState('');
  const phaseRef = useRef(phase); phaseRef.current = phase;

  async function flush() {
    if (sending.current || !alive.current || !pending.current.length) return;
    sending.current = true;
    const events = pending.current.splice(0, 32);
    try {
      if (control.current?.readyState === WebSocket.OPEN) {
        const ws = control.current; const seq = ++sequence.current;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { acknowledgement.current = null; ws.close(); reject(new Error('Thao tác chưa được xác nhận. Kiểm tra màn hình trước khi thử lại.')); }, 10000);
          acknowledgement.current = { seq, resolve: () => { clearTimeout(timeout); resolve(); }, reject: (error) => { clearTimeout(timeout); reject(error); } };
          ws.send(JSON.stringify({ seq, events }));
        });
      } else await executionApi.manualBrowserInput(executionId, events);
    }
    catch (error) { pending.current = []; if (alive.current) { setMessage(error.message); if ([404, 410, 503].includes(error.status)) setPhase('disconnected'); } }
    finally { sending.current = false; if (pending.current.length && alive.current) timer.current = setTimeout(flush, 20); }
  }
  function input(event) {
    if (phaseRef.current !== 'ready') return;
    if (pending.current.length >= 128) { setMessage('Đang xử lý thao tác trước. Vui lòng chờ.'); return; }
    const last = pending.current.at(-1);
    if (event.type === 'pointer' && event.event === 'move' && last?.type === 'pointer' && last.event === 'move') pending.current[pending.current.length - 1] = event;
    else pending.current.push(event);
    clearTimeout(timer.current); timer.current = setTimeout(flush, 20);
  }
  async function connect() {
    const version = ++generation.current;
    pending.current = []; clearTimeout(timer.current); setDialog(null);
    stream.current?.abort(); control.current?.close(); const controller = new AbortController(); stream.current = controller;
    setPhase('starting'); setMessage('Đang mở hoặc kết nối lại phiên trình duyệt…');
    try {
      await executionApi.startManualBrowser(executionId);
      if (!alive.current || version !== generation.current) return;
      const token = useAuthStore.getState().token || localStorage.getItem('etms_token');
      const base = api.defaults.baseURL.replace(/\/$/, '');
      try {
        const ticket = await executionApi.manualBrowserTicket(executionId);
        if (!alive.current || version !== generation.current) return;
        const url = new URL(ticket.path, new URL(base, window.location.href)); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url, ['etms-manual', ticket.ticket]); control.current = ws;
        ws.onmessage = (event) => { const data = JSON.parse(event.data); const ack = acknowledgement.current; if (ack?.seq === data.seq) { acknowledgement.current = null; if (data.ok) ack.resolve(); else ack.reject(new Error(data.error)); } };
        ws.onclose = () => { if (acknowledgement.current) { acknowledgement.current.reject(new Error('Kết nối thao tác đã ngắt. Kiểm tra màn hình trước khi thử lại.')); acknowledgement.current = null; } };
        ws.onerror = () => {};
      } catch { /* HTTP control remains available when WebSockets are unavailable. */ }
      const response = await fetch(`${base}/test-executions/${executionId}/manual-browser/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || body.error || 'Không kết nối được trình duyệt.'); }
      if (!alive.current || version !== generation.current) return;
      setPhase('ready'); setMessage('Nhấp vào màn hình để thao tác. Dán văn bản bằng Ctrl+V.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let receivedFrame = 0; let renderedFrame = 0;
      while (!controller.signal.aborted) {
        const result = await reader.read(); if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const type = block.match(/^event: (.+)$/m)?.[1]; const raw = block.match(/^data: (.+)$/m)?.[1];
          if (!raw || !alive.current || version !== generation.current) continue;
          const data = JSON.parse(raw);
          if (type === 'state') { setState(data); setAddress(data.url); if (data.navigation === 'loading') setMessage('Đang tải website…'); else if (data.navigation === 'error') setMessage('Website chưa tải được. Bấm Tải lại; phiên đăng nhập vẫn được giữ.'); else setMessage('Nhấp vào màn hình để thao tác. Dán văn bản bằng Ctrl+V.'); }
          if (type === 'frame') {
            const number = ++receivedFrame;
            const image = new Image(); image.onload = () => { if (alive.current && version === generation.current && canvas.current && number > renderedFrame) { renderedFrame = number; canvas.current.getContext('2d').drawImage(image, 0, 0, 1440, 900); } };
            image.src = `data:image/jpeg;base64,${data.data}`;
          }
          if (type === 'notice') setMessage(data.message);
          if (type === 'dialog') { setDialog(data); setDialogText(data.defaultValue || ''); }
          if (type === 'ended') { setPhase('ended'); setMessage(data.message); return; }
        }
      }
      if (alive.current && version === generation.current && !controller.signal.aborted) { setPhase('disconnected'); setMessage('Kết nối hiển thị đã ngắt. Kết nối lại để tiếp tục phiên nếu chưa hết hạn.'); }
    } catch (error) { if (!controller.signal.aborted && alive.current && version === generation.current) { setPhase('disconnected'); setMessage(error.message); } }
  }
  useEffect(() => {
    alive.current = true; connect();
    return () => { alive.current = false; generation.current++; stream.current?.abort(); control.current?.close(); clearTimeout(timer.current); pending.current = []; };
  }, [executionId]);

  async function endSession() {
    try { await executionApi.endManualBrowser(executionId); stream.current?.abort(); control.current?.close(); pending.current = []; setPhase('ended'); setMessage('Đã kết thúc phiên và đóng trình duyệt.'); }
    catch (error) { toast.error(error.message); }
  }
  function pointer(event, action) {
    event.preventDefault();
    if (action === 'move' && Date.now() - lastMove.current < 40) return;
    lastMove.current = Date.now();
    const bounds = canvas.current.getBoundingClientRect();
    const x = Math.min(1439, Math.max(0, (event.clientX - bounds.left) * 1440 / bounds.width));
    const y = Math.min(899, Math.max(0, (event.clientY - bounds.top) * 900 / bounds.height));
    if (action === 'down') { canvas.current.focus(); event.currentTarget.setPointerCapture(event.pointerId); }
    input({ type: 'pointer', event: action, x, y, button: event.button < 0 ? 0 : event.button });
  }
  function keyboard(event, action) {
    if (event.isComposing || ['Process', 'Dead', 'Unidentified'].includes(event.key)) return;
    // Let the browser deliver paste text; never paste the local clipboard automatically.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') return;
    event.preventDefault();
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { if (action === 'down') input({ type: 'text', text: event.key }); return; }
    input({ type: 'key', event: action, key: event.key === ' ' ? 'Space' : event.key });
  }
  return <section className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100" aria-label="Trình duyệt Manual từ xa">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900 p-3">
      <Button variant="outline" size="sm" disabled={phase !== 'ready'} onClick={() => input({ type: 'back' })}>←</Button>
      <Button variant="outline" size="sm" disabled={phase !== 'ready'} onClick={() => input({ type: 'forward' })}>→</Button>
      <Button variant="outline" size="sm" disabled={phase !== 'ready'} onClick={() => input({ type: 'reload' })}>Tải lại</Button>
      <form className="min-w-48 flex-1" onSubmit={(event) => { event.preventDefault(); input({ type: 'navigate', url: address }); }}><Input aria-label="URL trình duyệt từ xa" value={address} onChange={(event) => setAddress(event.target.value)} disabled={phase !== 'ready'} className="text-slate-900" /></form>
      <Button size="sm" disabled={phase !== 'ready' || capturing} onClick={async () => { setCapturing(true); try { await executionApi.captureManualBrowser(executionId); onEvidence(); toast.success('Đã lưu screenshot vào evidence của Test Execution'); } catch (error) { toast.error(error.message); } finally { setCapturing(false); } }}>Chụp evidence</Button>
      <Button size="sm" variant="outline" disabled={phase === 'ended'} onClick={endSession}>Kết thúc phiên</Button>
    </div>
    <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-2 text-xs"><span className="shrink-0">{phase === 'ready' ? '● Đã kết nối' : phase === 'starting' ? 'Đang khởi tạo…' : 'Phiên không kết nối'}</span><span className="truncate" role="status">{message}</span>{['disconnected', 'ended'].includes(phase) && <Button size="sm" onClick={connect}>{phase === 'ended' ? 'Bắt đầu phiên mới' : 'Kết nối lại'}</Button>}</div>
    {state.tabs.length > 1 && <Select aria-label="Tab trình duyệt từ xa" className="m-2 max-w-full text-slate-900" value={state.tabs.find((tab) => tab.active)?.id || ''} onChange={(event) => input({ type: 'tab', id: event.target.value })}>{state.tabs.map((tab) => <option value={tab.id} key={tab.id}>{tab.url || 'Tab mới'}</option>)}</Select>}
    <details className="border-b border-slate-800 p-2 text-xs"><summary>Nhập tiếng Việt / dán văn bản</summary><p className="my-2 text-slate-400">Chọn ô trên website trước, rồi gửi văn bản vào ô đó. Nội dung được che để bảo vệ mật khẩu.</p><div className="flex gap-2"><Input aria-label="Văn bản gửi tới website" type="password" autoComplete="off" className="text-slate-900" value={insertText} onChange={(event) => setInsertText(event.target.value)} /><Button size="sm" disabled={!insertText || phase !== 'ready'} onClick={() => { input({ type: 'text', text: insertText.slice(0, 4096) }); setInsertText(''); }}>Gửi văn bản</Button></div></details>
    {dialog && <div role="dialog" aria-label="Hộp thoại website đích" className="space-y-2 bg-slate-800 p-3"><p className="break-words text-sm">{dialog.message}</p>{dialog.type === 'prompt' && <Input aria-label="Trả lời website" value={dialogText} onChange={(event) => setDialogText(event.target.value)} className="text-slate-900" />}<div className="flex gap-2"><Button size="sm" onClick={() => { input({ type: 'dialog', accept: true, text: dialogText }); setDialog(null); }}>Đồng ý</Button><Button size="sm" variant="outline" onClick={() => { input({ type: 'dialog', accept: false }); setDialog(null); }}>Hủy</Button></div></div>}
    <div className="min-h-0 flex-1 overflow-auto p-2"><canvas ref={canvas} width={1440} height={900} tabIndex={0} aria-label="Màn hình website kiểm thử tương tác" className={`h-auto w-full bg-white outline-none focus:ring-2 focus:ring-violet-400 ${phase !== 'ready' ? 'pointer-events-none opacity-40' : ''}`} style={{ touchAction: 'none' }} onPointerDown={(event) => pointer(event, 'down')} onPointerUp={(event) => pointer(event, 'up')} onPointerMove={(event) => pointer(event, 'move')} onPointerCancel={() => input({ type: 'release' })} onContextMenu={(event) => event.preventDefault()} onWheel={(event) => { event.preventDefault(); input({ type: 'wheel', deltaX: Math.max(-3000, Math.min(3000, event.deltaX)), deltaY: Math.max(-3000, Math.min(3000, event.deltaY)) }); }} onKeyDown={(event) => keyboard(event, 'down')} onKeyUp={(event) => keyboard(event, 'up')} onBlur={() => input({ type: 'release' })} onPaste={(event) => { event.preventDefault(); input({ type: 'text', text: event.clipboardData.getData('text').slice(0, 4096) }); }} /></div>
    <p className="border-t border-slate-800 p-2 text-xs text-slate-400">Trình duyệt riêng · đăng nhập tại đây · tự đóng sau 15 phút không thao tác, tối đa 2 giờ. Mất kết nối không tự xóa phiên. Video và truyền tệp vào/ra website đích chưa được hỗ trợ.</p>
  </section>;
}
