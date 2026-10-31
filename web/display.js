let zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const clock = document.getElementById('clock'), date = document.getElementById('displayDate');
function update() { const now = Date.now(); clock.textContent = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit', timeZone: zone}).format(now); date.textContent = new Intl.DateTimeFormat('en-US', {weekday: 'long', month: 'long', day: 'numeric', timeZone: zone}).format(now); }
async function status() { try { const s = await (await fetch('/room-status')).json(); zone = s.timeZone || zone; update(); document.getElementById('displayStatus').textContent = s.paused ? 'Automatic meetings paused' : s.attention ? 'Room needs attention · Open room controls' : s.connected ? 'Ready for your next meeting' : 'Room setup in progress'; } catch { document.getElementById('displayStatus').textContent = 'Controller offline'; } }
update(); status(); setInterval(update, 1000); setInterval(status, 5000);
