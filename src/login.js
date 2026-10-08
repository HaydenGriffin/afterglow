// The sign-in form: Music Assistant's address, a username and a password.
// Shown on first launch and whenever the token stops working. Arrow keys move
// between the rows; OK on a field opens the TV's keyboard, OK on the button
// signs in. Typing happens in ordinary inputs, which keys.js leaves alone.
import { signIn } from "./ma.js";

export function createLogin(element, { deviceName, onSignedIn }) {
  const rows = Array.prototype.slice.call(element.querySelectorAll(".field, .button"));
  const inputs = { host: element.querySelector("#login-host"), user: element.querySelector("#login-user"), password: element.querySelector("#login-password") };
  const button = element.querySelector(".button");
  const error = element.querySelector(".login-error");
  let focus = 0;
  let busy = false;
  let shown = false;

  function render() {
    rows.forEach((row, i) => (row.className = row.className.replace(/ ?focus/, "") + (i === focus ? " focus" : "")));
  }

  function inputOf(row) {
    return row.querySelector("input");
  }

  function setError(text) {
    error.textContent = text || "";
  }

  async function submit() {
    if (busy) return;
    const host = inputs.host.value.trim();
    const username = inputs.user.value.trim();
    const password = inputs.password.value;
    if (!host) return setError("Enter Music Assistant's address");
    if (!username || !password) return setError("Enter the username and password");
    busy = true;
    setError("");
    button.textContent = "Signing in…";
    try {
      const auth = await signIn({ host, username, password, deviceName });
      inputs.password.value = "";
      onSignedIn(auth);
    } catch (e) {
      setError(String((e && e.message) || e));
    } finally {
      busy = false;
      button.textContent = "Sign in";
    }
  }

  for (const key of Object.keys(inputs)) {
    const input = inputs[key];
    input.addEventListener("keydown", (event) => {
      // Enter leaves the field and moves on; Back/Escape just leaves it.
      if (event.key === "Enter" || event.keyCode === 13) {
        event.preventDefault();
        input.blur();
        focus = Math.min(rows.length - 1, focus + 1);
        render();
      } else if (event.keyCode === 461 || event.keyCode === 27) {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("focus", () => {
      focus = rows.findIndex((row) => inputOf(row) === input);
      render();
    });
  }
  rows.forEach((row, i) => {
    row.addEventListener("click", () => {
      focus = i;
      render();
      activate();
    });
  });

  function activate() {
    const row = rows[focus];
    const input = inputOf(row);
    if (input) input.focus();
    else submit();
  }

  return {
    show({ host, user, message }) {
      shown = true;
      if (host) inputs.host.value = host;
      if (user) inputs.user.value = user;
      setError(message || "");
      focus = !inputs.host.value ? 0 : !inputs.user.value ? 1 : 2;
      element.style.display = "flex";
      render();
    },
    hide() {
      shown = false;
      element.style.display = "none";
    },
    get isOpen() {
      return shown;
    },
    // Returns true when the key was used by the form.
    handleKey(name) {
      if (!shown) return false;
      if (document.activeElement && document.activeElement.tagName === "INPUT") return true; // the keyboard has it
      if (name === "up") focus = (focus + rows.length - 1) % rows.length;
      else if (name === "down") focus = (focus + 1) % rows.length;
      else if (name === "ok") activate();
      else if (name === "back") return false; // leaves the app
      render();
      return true;
    },
  };
}
