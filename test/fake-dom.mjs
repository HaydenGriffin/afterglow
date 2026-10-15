// Just enough of the DOM for menu.js and karaoke.js under node.
export class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this.className = "";
    this.style = {};
    this.scrollTop = 0;
    this.listeners = {};
    this.ownText = "";
    this.writes = 0; // textContent assignments, to check for needless DOM work
    const node = this;
    this.classList = {
      contains: (name) => node.className.split(/\s+/).indexOf(name) >= 0,
      toggle(name, on) {
        const names = node.className.split(/\s+/).filter(Boolean).filter((n) => n !== name);
        if (on === undefined ? !this.contains(name) : on) names.push(name);
        node.className = names.join(" ");
      },
    };
  }
  get textContent() {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    this.writes++;
    this.children = [];
    this.ownText = String(value);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  scrollIntoView() {}
  all() {
    return this.children.reduce((list, c) => list.concat([c], c.all()), []);
  }
  querySelector(selector) {
    const name = selector.replace(/^\./, "");
    return this.all().find((n) => n.classList.contains(name)) || null;
  }
}

export function installDocument() {
  globalThis.document = { createElement: (tag) => new FakeNode(tag) };
}

// Timers driven by hand: advance(ms) runs whatever falls due.
export function fakeTimers() {
  let now = 0;
  let id = 0;
  const pending = new Map();
  const set = (fn, ms, every) => {
    pending.set(++id, { fn, at: now + ms, every });
    return id;
  };
  return {
    setTimeout: (fn, ms) => set(fn, ms, 0),
    setInterval: (fn, ms) => set(fn, ms, ms),
    clear: (handle) => pending.delete(handle),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [key, t] of pending) if (t.at <= end && (!next || t.at < next[1].at)) next = [key, t];
        if (!next) break;
        now = next[1].at;
        if (next[1].every) next[1].at += next[1].every;
        else pending.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    get now() {
      return now;
    },
  };
}
