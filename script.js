// ===== MyGrade — app.js =====
const DB_NAME = 'mygrade', STORE = 'grades';
let db, grades = [], editId = null;
const $ = s => document.querySelector(s);

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function run(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  });
}
const dbAll = () => run('readonly', s => s.getAll());
const dbPut = g => run('readwrite', s => s.put(g));
const dbDel = id => run('readwrite', s => s.delete(id));
const dbClear = () => run('readwrite', s => s.clear());
async function reload() { grades = await dbAll(); renderAll(); }

// ---------- Hitung ----------
const avg = arr => arr.length ? arr.reduce((a, b) => a + b.score, 0) / arr.length : null;
const fmt = n => n === null ? '–' : (Math.round(n * 100) / 100).toString().replace('.', ',');
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bySemester() {
  const m = {};
  grades.forEach(g => (m[g.semester] ||= []).push(g));
  return Object.keys(m).map(Number).sort((a, b) => a - b).map(s => ({ semester: s, items: m[s], avg: avg(m[s]) }));
}

// ---------- Tampilan ----------
function renderAll() { renderHome(); renderResult(); renderManage(); }

function renderHome() {
  $('#homeAvg').textContent = fmt(avg(grades));
  $('#homeCount').textContent = grades.length;
  const recent = [...grades].sort((a, b) => b.id - a.id).slice(0, 5);
  $('#recentList').innerHTML = recent.length
    ? recent.map(g => `<li><div class="info"><div class="name">${esc(g.subject)}</div>
        <div class="meta">Semester ${g.semester}</div></div><div class="score">${fmt(g.score)}</div></li>`).join('')
    : '<li class="empty">Belum ada nilai. Tekan “Tambah nilai” untuk mulai.</li>';
}

function renderResult() {
  const sems = bySemester();
  $('#semBars').innerHTML = sems.length
    ? sems.map(s => `<div class="bar"><div class="bar-head"><span>Semester ${s.semester}
        <small class="muted">(${s.items.length} mapel)</small></span><strong>${fmt(s.avg)}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${s.avg}%"></div></div></div>`).join('')
    : '<p class="empty">Belum ada data.</p>';
  $('#resAvg').textContent = fmt(avg(grades));

  let t = 'Belum ada data.';
  if (sems.length === 1) t = `Baru ada satu semester (rata-rata ${fmt(sems[0].avg)}). Tambahkan semester lain untuk melihat perkembangan.`;
  if (sems.length > 1) {
    const first = sems[0], last = sems[sems.length - 1], d = last.avg - first.avg;
    t = d > 0 ? `Naik ${fmt(d)} poin dari semester ${first.semester} ke semester ${last.semester}. Pertahankan!`
      : d < 0 ? `Turun ${fmt(-d)} poin dari semester ${first.semester} ke semester ${last.semester}. Masih bisa dikejar.`
      : `Stabil di ${fmt(last.avg)} dari semester ${first.semester} ke semester ${last.semester}.`;
  }
  $('#trendText').textContent = t;
}

function renderManage() {
  const sorted = [...grades].sort((a, b) => a.semester - b.semester || a.subject.localeCompare(b.subject));
  $('#manageList').innerHTML = sorted.length
    ? sorted.map(g => `<li><div class="info"><div class="name">${esc(g.subject)}</div>
        <div class="meta">Semester ${g.semester} · nilai ${fmt(g.score)}</div></div>
        <button class="mini" data-edit="${g.id}">Edit</button>
        <button class="mini del" data-del="${g.id}">Hapus</button></li>`).join('')
    : '<li class="empty">Belum ada data.</li>';
}

// ---------- Navigasi ----------
function go(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  if (view !== 'input') resetForm();
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) return go(g.dataset.go);
  const ed = e.target.closest('[data-edit]');
  if (ed) return startEdit(Number(ed.dataset.edit));
  const del = e.target.closest('[data-del]');
  if (del) return removeGrade(Number(del.dataset.del));
});

// ---------- Form ----------
function resetForm() {
  editId = null;
  $('#gradeForm').reset();
  $('#formTitle').textContent = 'Tambah nilai';
  $('#saveBtn').textContent = 'Hitung & simpan';
  $('#cancelEdit').hidden = true;
  $('#formResult').hidden = true;
}
function startEdit(id) {
  const g = grades.find(x => x.id === id);
  if (!g) return;
  go('input');
  editId = id;
  $('#semester').value = g.semester;
  $('#subject').value = g.subject;
  $('#score').value = g.score;
  $('#formTitle').textContent = 'Edit nilai';
  $('#saveBtn').textContent = 'Simpan perubahan';
  $('#cancelEdit').hidden = false;
}
$('#cancelEdit').addEventListener('click', () => go('settings'));

$('#gradeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const score = parseFloat($('#score').value);
  const subject = $('#subject').value.trim();
  if (!subject || isNaN(score) || score < 0 || score > 100) return toast('Nilai harus antara 0 dan 100');
  const sem = Number($('#semester').value);
  const rec = { semester: sem, subject, score };
  const wasEdit = editId !== null;
  if (wasEdit) rec.id = editId;
  await dbPut(rec);
  await reload();
  if (wasEdit) { toast('Perubahan disimpan'); return go('settings'); }
  const semAvg = avg(grades.filter(g => g.semester === sem));
  $('#gradeForm').reset();
  $('#semester').value = sem;
  const box = $('#formResult');
  box.hidden = false;
  box.textContent = `Tersimpan. Rata-rata semester ${sem}: ${fmt(semAvg)} · Keseluruhan: ${fmt(avg(grades))}`;
  $('#subject').focus();
});

// ---------- Hapus, backup ----------
async function removeGrade(id) {
  if (!confirm('Hapus nilai ini?')) return;
  await dbDel(id); await reload(); toast('Nilai dihapus');
}
$('#clearBtn').addEventListener('click', async () => {
  if (!grades.length) return toast('Tidak ada data');
  if (!confirm('Hapus SEMUA nilai? Tindakan ini tidak bisa dibatalkan.')) return;
  await dbClear(); await reload(); toast('Semua data dihapus');
});
$('#exportBtn').addEventListener('click', () => {
  if (!grades.length) return toast('Belum ada data untuk dicadangkan');
  const blob = new Blob([JSON.stringify(grades, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mygrade-cadangan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const ok = Array.isArray(data) ? data.filter(g => g && typeof g.subject === 'string' &&
      Number.isFinite(g.score) && g.score >= 0 && g.score <= 100 && Number.isInteger(g.semester)) : [];
    if (!ok.length) throw new Error();
    for (const g of ok) await dbPut({ semester: g.semester, subject: g.subject.slice(0, 40), score: g.score });
    await reload(); toast(`${ok.length} nilai dipulihkan`);
  } catch { toast('File cadangan tidak valid'); }
  e.target.value = '';
});

// ---------- Toast ----------
let tt;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Mulai ----------
(async () => {
  db = await openDB();
  await reload();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
