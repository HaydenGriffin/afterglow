// A minimal document for testing views without a browser: elements, classes,
// text, events, focus and simple selectors ("tag", ".class", "tag.class", and
// comma lists). Views under test build their DOM with createElement only.

class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = "";
    this.tabIndex = -1;
    this.disabled = false;
    this.ownText = "";
  }
  get classList() {
    const node = this;
    const list = () => node.className.split(/\s+/).filter(Boolean);
    return {
      add(...names) { const l = list(); names.forEach(n => { if (l.indexOf(n) < 0) l.push(n); }); node.className = l.join(" "); },
      remove(...names) { node.className = list().filter(n => names.indexOf(n) < 0).join(" "); },
      contains(name) { return list().indexOf(name) >= 0; },
      toggle(name, on) { const has = list().indexOf(name) >= 0; const want = on === undefined ? !has : !!on; if (want && !has) this.add(name); if (!want && has) this.remove(name); return want; },
    };
  }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
  }
  insertBefore(child, before) {
    if (!before) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child); return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) { this.children.splice(i, 1); child.parentNode = null; }
    if (this.ownerDocument.activeElement && !this.ownerDocument.body.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(""); }
  set textContent(value) { this.children.slice().forEach(c => this.removeChild(c)); this.ownText = String(value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  dispatch(type, init) {
    const event = Object.assign({ type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, init);
    (this.listeners[type] || []).slice().forEach(fn => fn(event));
    return event;
  }
  click() { if (!this.disabled) this.dispatch("click"); }
  focus() {
    const doc = this.ownerDocument;
    if (doc.activeElement === this) return;
    const previous = doc.activeElement; doc.activeElement = this;
    if (previous && previous !== doc.body) previous.dispatch("blur");
    this.dispatch("focus");
  }
  blur() { const doc = this.ownerDocument; if (doc.activeElement === this) { doc.activeElement = doc.body; this.dispatch("blur"); } }
  scrollIntoView() {}
  matches(selector) {
    return selector.split(",").some(part => {
      const m = /^\s*([a-z0-9]*)((?:\.[\w-]+)*)\s*$/i.exec(part);
      if (!m) throw Error("fake-dom: unsupported selector " + selector);
      if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
      return m[2].split(".").filter(Boolean).every(c => this.classList.contains(c));
    });
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = node => node.children.forEach(c => { if (c.matches(selector)) out.push(c); walk(c); });
    walk(this); return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

export function createFakeDocument() {
  const doc = { created: 0, listeners: {} };
  doc.createElement = tag => { doc.created++; return new FakeElement(doc, tag); };
  doc.body = new FakeElement(doc, "body");
  doc.activeElement = doc.body;
  doc.addEventListener = (type, fn) => { (doc.listeners[type] = doc.listeners[type] || []).push(fn); };
  doc.dispatch = (type, init) => (doc.listeners[type] || []).forEach(fn => fn(Object.assign({ type }, init)));
  return doc;
}

// Installs a fake document as the global one for the length of a test.
export function useFakeDocument(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const doc = createFakeDocument();
  globalThis.document = doc;
  t.after(() => { if (previous) Object.defineProperty(globalThis, "document", previous); else delete globalThis.document; });
  return doc;
}
