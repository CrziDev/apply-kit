// ---------- Storage ----------
const DEFAULTS = {
  links: [
    { id: "l1", label: "GitHub", value: "https://github.com/your-username" },
    { id: "l2", label: "LinkedIn", value: "https://www.linkedin.com/in/your-name" },
    { id: "l3", label: "Portfolio", value: "https://your-site.com" }
  ],
  text: [
    { id: "t1", label: "Short bio", value: "Write a 2-3 sentence summary about yourself here." },
    { id: "t2", label: "Why this role?", value: "Paste your go-to answer here and tweak per application." },
    { id: "t3", label: "Phone", value: "+63 ..." }
  ]
};

const store = {
  async get() {
    const d = await chrome.storage.local.get(["links", "text"]);
    return { links: d.links || DEFAULTS.links, text: d.text || DEFAULTS.text };
  },
  set(data) { return chrome.storage.local.set(data); }
};

// Files live in IndexedDB (blobs)
const db = new Promise((res, rej) => {
  const r = indexedDB.open("applykit", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("files", { keyPath: "id" });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function fileOp(mode, fn) {
  const d = await db;
  return new Promise((res, rej) => {
    const tx = d.transaction("files", mode);
    const req = fn(tx.objectStore("files"));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const listFiles = () => fileOp("readonly", s => s.getAll());
const putFile = f => fileOp("readwrite", s => s.put(f));
const delFile = id => fileOp("readwrite", s => s.delete(id));

// ---------- UI ----------
const IS_TAB = new URLSearchParams(location.search).has("manage");
if (IS_TAB) document.body.classList.add("tabmode");
let tab = IS_TAB && location.hash === "#files" ? "files" : "links", query = "";
let editingId = null; // id of the card being edited, or "new" for an unsaved card
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1400);
}

async function copy(text) {
  await navigator.clipboard.writeText(text);
  toast("Copied ✓");
}

function matches(it) {
  const q = query.toLowerCase();
  return !q || it.label.toLowerCase().includes(q) || (it.value || it.name || "").toLowerCase().includes(q);
}

async function render() {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === tab));
  if (tab === "files") await renderFiles(); else await renderItems(tab);
  renderAddBar();
}

async function renderItems(kind) {
  const data = await store.get();
  const pane = $("#" + kind);
  pane.innerHTML = "";
  const items = data[kind].filter(it => matches(it) || it.id === editingId);
  if (editingId === "new") items.push({ id: "new", label: "", value: "" });
  if (!items.length) pane.innerHTML = '<div class="empty">Nothing here yet.</div>';
  for (const it of items) {
    const editing = it.id === editingId;
    const el = document.createElement("div");
    el.className = editing ? "item editing" : "item";
    el.innerHTML = editing
      ? `<input class="label" placeholder="Title"><textarea class="value" placeholder="${kind === "links" ? "https://…" : "Description"}"></textarea>
        <div class="actions"><button data-a="save">Save</button><button data-a="del">✕</button></div>`
      : `<div class="label"></div><div class="value"></div>
        <div class="actions">${kind === "links" ? '<button data-a="open">Open</button>' : ""}<button data-a="edit">Edit</button><button data-a="del">✕</button></div>`;
    if (editing) {
      el.querySelector(".label").value = it.label;
      el.querySelector(".value").value = it.value;
    } else {
      el.querySelector(".label").textContent = it.label;
      el.querySelector(".value").textContent = it.value;
    }
    el.onclick = e => {
      const a = e.target.dataset.a;
      if (a === "del") return it.id === "new" ? edit(null) : remove(kind, it.id);
      if (a === "open") return openLink(it.value);
      if (a === "edit") return edit(it.id);
      if (a === "save") return save(kind, it.id, el);
      if (!editing) copy(it.value);
    };
    pane.appendChild(el);
    if (it.id === "new") { el.scrollIntoView({ block: "nearest" }); el.querySelector(".label").focus(); }
  }
}

function openLink(value) {
  // Bare domains like "your-site.com" need a scheme or the tab opens to an error page.
  const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  chrome.tabs.create({ url });
  if (!IS_TAB) window.close();
}

async function remove(kind, id) {
  const data = await store.get();
  data[kind] = data[kind].filter(i => i.id !== id);
  if (editingId === id) editingId = null;
  await store.set({ [kind]: data[kind] });
  render();
}

function edit(id) {
  editingId = id;
  render();
}

async function save(kind, id, el) {
  const label = el.querySelector(".label").value.trim(), value = el.querySelector(".value").value.trim();
  if (!label || !value) return toast("Fill in both fields");
  const data = await store.get();
  if (id === "new") data[kind].push({ id: uid(), label, value });
  else data[kind] = data[kind].map(i => i.id === id ? { ...i, label, value } : i);
  editingId = null;
  await store.set({ [kind]: data[kind] });
  render();
}

async function renderFiles() {
  const pane = $("#files");
  pane.innerHTML = "";
  const files = (await listFiles()).filter(matches);
  if (!files.length) pane.innerHTML = '<div class="empty">Add your resume, cover letter, etc.</div>';
  for (const f of files) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div class="label"></div><div class="value"></div><div class="filemeta"></div>
      <div class="actions"><button data-a="dl">Download</button><button data-a="del">✕</button></div>`;
    el.querySelector(".label").textContent = f.label;
    el.querySelector(".value").textContent = f.name;
    el.querySelector(".filemeta").textContent = `${(f.size / 1024).toFixed(0)} KB · click to attach to the upload field`;
    el.onclick = async e => {
      const a = e.target.dataset.a;
      if (a === "del") { await delFile(f.id); return render(); }
      if (a === "dl") { return download(f); }
      attach(f);
    };
    pane.appendChild(el);
  }
}

function download(f) {
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement("a");
  a.href = url; a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function attach(f) {
  const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
  const dataUrl = await toDataUrl(f.blob);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabInfo.id, allFrames: true },
    args: [dataUrl, f.name, f.type],
    func: async (dataUrl, name, type) => {
      const inputs = [...document.querySelectorAll('input[type="file"]')];
      const target = (window.__applyKitLast && window.__applyKitLast.isConnected) ? window.__applyKitLast : inputs[0];
      if (!target) return false;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], name, { type: type || blob.type });
      const dt = new DataTransfer();
      dt.items.add(file);
      target.files = dt.files;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  });
  const ok = results.some(r => r.result);
  toast(ok ? "Attached ✓" : "No upload field found — click it first, or use Download");
}

function renderAddBar() {
  const bar = $("#addbar");
  if (tab === "files" && !IS_TAB) {
    // Firefox closes the popup when a file picker opens, so adding files happens in a full tab.
    bar.innerHTML = `<button id="f-open">Add / manage files in a tab</button>`;
    $("#f-open").onclick = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?manage=1#files") });
      window.close();
    };
    return;
  }
  if (tab === "files") {
    bar.innerHTML = `<input id="f-label" placeholder="Label (e.g. Resume 2026)">
      <input id="f-file" type="file"><button id="f-save">Add file</button>`;
    $("#f-save").onclick = async () => {
      const file = $("#f-file").files[0];
      if (!file) return toast("Choose a file first");
      await putFile({ id: uid(), label: $("#f-label").value || file.name, name: file.name, type: file.type, size: file.size, blob: file });
      render();
    };
    return;
  }
  bar.innerHTML = `<button id="f-add" title="Add">+</button>`;
  $("#f-add").onclick = () => edit("new");
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; editingId = null; render(); });
$("#search").oninput = e => { query = e.target.value; render(); };
render();
