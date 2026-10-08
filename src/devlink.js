// Test link to scripts/dev-server.mjs. Does nothing unless a report address is
// configured. Sends status, sends canvas snapshots on request, and runs the
// commands the server passes on; a command may answer with `reply(body)`.
//
// It is a WebSocket rather than HTTP requests: the TV's browser sends none of
// the latter from a packaged app's page, while WebSockets work.

const STATUS_MS = 2000;
const RETRY_MS = 3000;
const SHOT_WIDTH = 960;
const SHOT_HEIGHT = 540;

export function startDevlink({ base, client, getStatus, engine, onCommand }) {
  if (!base) return;
  const url = base.replace(/^http/, "ws") + "/link?client=" + encodeURIComponent(client);
  const shot = document.createElement("canvas");
  shot.width = SHOT_WIDTH;
  shot.height = SHOT_HEIGHT;
  const shotCtx = shot.getContext("2d");
  let socket = null;
  let wantShot = false;

  function send(body) {
    if (!socket || socket.readyState !== 1) return;
    socket.send(JSON.stringify(Object.assign({ status: getStatus() }, body)));
  }

  // Snapshots are taken straight after a render so the WebGL canvas still
  // holds its frame, and scaled to what the panel shows.
  engine.onAfterRender((canvas) => {
    if (!wantShot) return;
    wantShot = false;
    try {
      shotCtx.drawImage(canvas, 0, 0, SHOT_WIDTH, SHOT_HEIGHT);
      send({ shot: shot.toDataURL("image/jpeg", 0.85) });
    } catch (e) {
      send({ shotError: String(e) });
    }
  });

  function run(command) {
    if (command.type === "snapshot") wantShot = true;
    else if (command.type === "status") send({});
    else if (command.type === "reload") location.reload();
    else if (command.type === "go") location.search = command.query;
    else onCommand(command, send);
  }

  function connect() {
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => send({});
    ws.onmessage = (event) => {
      try {
        run(JSON.parse(event.data));
      } catch (e) {
        // not a command
      }
    };
    ws.onclose = () => setTimeout(connect, RETRY_MS);
    ws.onerror = () => {};
  }

  setInterval(() => send({}), STATUS_MS);
  connect();
}
