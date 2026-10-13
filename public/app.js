const API_ROOT = '/api/v1';
const links = [
  ['index.html','Tổng quan'],['auth.html','1 · Bảo mật'],['agile-req.html','2–3 · Agile & Yêu cầu'],
  ['test-design.html','4 · Test Design'],['execution.html','5 · Execution'],['bug-track.html','6 · Bug Tracking'],
  ['ai-core.html','7 · AI Core'],['reports.html','8 · Báo cáo & KPI'],
];

const token = () => localStorage.getItem('etms_token') || '';
const toast = (message, error = false) => {
  const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`; item.textContent = message; document.body.append(item); setTimeout(() => item.remove(), 3500);
};
const show = (element, value) => { element.textContent = JSON.stringify(value, null, 2); element.classList.remove('hidden'); };

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(token() ? { Authorization:`Bearer ${token()}` } : {}), ...(options.headers || {}) };
  const response = await fetch(path.startsWith('/api/') ? path : `${API_ROOT}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ success:false,error:`HTTP ${response.status}` }));
  if (!response.ok || data.success === false) { const error = new Error(data.error || 'Yêu cầu thất bại'); error.payload = data; throw error; }
  return data;
}

function shell() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const aside = document.createElement('aside');
  aside.innerHTML = `<a class="brand" href="/"><span class="brand-mark">ET</span><span>Enterprise<br>Test Manager</span></a><nav>${links.map(([href,label]) => `<a class="${href===page?'active':''}" href="/${href}">${label}</a>`).join('')}</nav><div class="session"><strong>${token()?'● JWT đang hoạt động':'○ Chưa đăng nhập'}</strong><span>${token()?'Mọi API call sẽ tự gắn Bearer token.':'Đăng nhập ở phân hệ Bảo mật.'}</span><div class="actions" style="margin-top:10px"><button id="logoutLocal" class="secondary" type="button">Xóa token</button></div></div>`;
  document.querySelector('.shell').prepend(aside);
  aside.querySelector('#logoutLocal').onclick = () => { localStorage.removeItem('etms_token'); toast('Đã xóa JWT khỏi trình duyệt'); setTimeout(()=>location.reload(),400); };
}

function values(form) {
  const data = {}; new FormData(form).forEach((value,key) => {
    const field = form.elements[key]; if (field?.dataset.param !== undefined) return;
    if (field?.type === 'checkbox') value = field.checked;
    if (field?.dataset.json !== undefined && value !== '') value = JSON.parse(value);
    if (field?.dataset.number !== undefined && value !== '') value = Number(value);
    if (value !== '') data[key] = value;
  }); return data;
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-api]'); if (!form) return;
  event.preventDefault(); const output = form.parentElement.querySelector('.result') || document.querySelector('#globalResult');
  try {
    let url = form.dataset.api; [...form.elements].forEach((field) => { if (field.name) url = url.replaceAll(`{${field.name}}`, encodeURIComponent(field.value)); });
    const method = (form.dataset.method || 'POST').toUpperCase(); const body = values(form);
    if (method === 'GET' && Object.keys(body).length) url += `${url.includes('?')?'&':'?'}${new URLSearchParams(body)}`;
    const result = await api(url, { method, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }), ...(form.dataset.secret ? { headers:{'x-webhook-secret':form.dataset.secret} } : {}) });
    if (result.data?.token) localStorage.setItem('etms_token', result.data.token);
    show(output, result); toast('API trả về thành công');
    if (form.dataset.reload === 'true') setTimeout(()=>location.reload(),600);
  } catch (error) { show(output, error.payload || { error:error.message }); toast(error.message,true); }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-load]'); if (!button) return;
  try { const result = await api(button.dataset.load, { method:button.dataset.method || 'GET' }); show(document.querySelector(button.dataset.target || '#globalResult'),result); toast('Đã tải dữ liệu'); }
  catch(error){ show(document.querySelector(button.dataset.target || '#globalResult'),error.payload || {error:error.message});toast(error.message,true); }
});

document.addEventListener('DOMContentLoaded', shell);
window.etms = { api, toast, show };
