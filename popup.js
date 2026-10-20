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
const fromTemplate = id => $(id).content.firstElementChild.cloneNode(true);

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

function showTab(name) {
  tab = name;
  editingId = null;
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  document.querySelectorAll(".pane").forEach(p => p.hidden = p.id !== tab);
  // Firefox closes the popup when a file picker opens, so adding files happens in a full tab.
  $("#add-item").hidden = tab === "files";
  $("#open-manager").hidden = tab !== "files" || IS_TAB;
  $("#file-form").hidden = tab !== "files" || !IS_TAB;
  render();
}

function render() {
  return tab === "files" ? renderFiles() : renderItems(tab);
}

function fillPane(id, cards) {
  const pane = $("#" + id);
  pane.querySelector(".list").replaceChildren(...cards);
  pane.querySelector(".empty").hidden = cards.length > 0;
}

async function renderItems(kind) {
  const data = await store.get();
  const items = data[kind].filter(it => matches(it) || it.id === editingId);
  if (editingId === "new") items.push({ id: "new", label: "", value: "" });
  fillPane(kind, items.map(it => itemCard(kind, it)));
  if (editingId === "new") {
    const el = $(`#${kind} .list`).lastElementChild;
    el.scrollIntoView({ block: "nearest" });
    el.querySelector(".label").focus();
  }
}

function itemCard(kind, it) {
  const editing = it.id === editingId;
  const el = fromTemplate(editing ? "#tpl-edit" : "#tpl-item");
  if (editing) {
    el.querySelector(".label").value = it.label;
    el.querySelector(".value").value = it.value;
    el.querySelector(".value").placeholder = kind === "links" ? "https://…" : "Description";
  } else {
    el.querySelector(".label").textContent = it.label;
    el.querySelector(".value").textContent = it.value;
    el.querySelector('[data-a="open"]').hidden = kind !== "links";
  }
  el.onclick = e => {
    const a = e.target.dataset.a;
    if (a === "del") return it.id === "new" ? edit(null) : remove(kind, it.id);
    if (a === "open") return openLink(it.value);
    if (a === "edit") return edit(it.id);
    if (a === "save") return save(kind, it.id, el);
    if (!editing) copy(it.value);
  };
  return el;
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
  const files = (await listFiles()).filter(matches);
  fillPane("files", files.map(fileCard));
}

function fileCard(f) {
  const el = fromTemplate("#tpl-file");
  el.querySelector(".label").textContent = f.label;
  el.querySelector(".value").textContent = f.name;
  el.querySelector(".filemeta").textContent = `${(f.size / 1024).toFixed(0)} KB` + (IS_TAB ? "" : " · click to attach to the upload field");
  el.onclick = async e => {
    const a = e.target.dataset.a;
    if (a === "del") { await delFile(f.id); return render(); }
    if (a === "dl") { return download(f); }
    attach(f);
  };
  return el;
}

function download(f) {
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement("a");
  a.href = url; a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const toDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function attach(f) {
  if (IS_TAB) return toast("Open Apply Kit from the application page to attach");
  try {
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
  } catch {
    // Firefox blocks scripts on pages like about: and addons.mozilla.org.
    toast("Can't attach on this page — use Download");
  }
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => showTab(b.dataset.tab));
$("#search").oninput = e => { query = e.target.value; render(); };
$("#add-item").onclick = () => edit("new");
$("#open-manager").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?manage=1#files") });
  window.close();
};
$("#file-form").onsubmit = async e => {
  e.preventDefault();
  const file = $("#f-file").files[0];
  await putFile({ id: uid(), label: $("#f-label").value || file.name, name: file.name, type: file.type, size: file.size, blob: file });
  e.target.reset();
  render();
};
showTab(tab);
