// Guided setup sits on the same authenticated controls as the room dashboard.
// Checkmarks describe saved state; device/visitor/domain tests are explicitly manual.
let setupStep = 0, setupInitialized = false, showingOverview = false, guideHasClient = false;
const setupDirty = new Set();
const stepLabels = ['ROOM', 'GOOGLE ACCOUNT', 'CAMERA & AUDIO', 'DROP-INS', 'ROOM ADDRESS', 'FINAL CHECK'];
const getSetup = s => ({brandedUrl:'',devicesConfirmed:false,visitConfirmed:false,linkConfirmed:false,completed:false,...s?.settings.setup});
function showStep(index, focus = true) {
  setupStep = index; showingOverview = false;
  $('setupView').hidden = false; $('overviewView').hidden = true;
  document.querySelectorAll('[data-pane]').forEach(p => p.hidden = Number(p.dataset.pane) !== index);
  document.querySelectorAll('[data-step]').forEach(b => {
    const selected = Number(b.dataset.step) === index;
    b.classList.toggle('selected', selected);
    if (selected) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
  });
  $('stepKicker').textContent = `${stepLabels[index]} · STEP ${index+1} OF 6`;
  $('viewTitle').textContent = 'Room setup';
  if (focus) document.querySelector(`[data-pane="${index}"] h1`).focus({preventScroll:true});
  document.querySelector('main').scrollTo({top:0,behavior:'instant'});
  window.scrollTo({top:0,behavior:'instant'});
}
function showOverview() {
  showingOverview = true; $('setupView').hidden = true; $('overviewView').hidden = false; $('viewTitle').textContent = 'Room overview';
  document.querySelectorAll('[data-step]').forEach(b => { b.classList.remove('selected'); b.removeAttribute('aria-current'); });
  document.querySelector('main').scrollTo({top:0,behavior:'instant'});
  window.scrollTo({top:0,behavior:'instant'});
}
function setupProgress(s) {
  const p = getSetup(s);
  return [Boolean(s.email),s.calendar.connected, s.browser.verified && p.devicesConfirmed,
    s.settings.dropInEnabled && s.dropIn.connected,
    Boolean(p.brandedUrl && p.linkConfirmed),p.completed];
}
function renderSetup(s) {
  const p = getSetup(s), progress = setupProgress(s);
  $('setupCount').textContent = p.completed ? 'COMPLETE' : `${progress.filter(Boolean).length} / 6`;
  document.querySelectorAll('[data-step]').forEach((b,i) => { b.classList.toggle('done',progress[i]); b.querySelector('.step-check').textContent = progress[i] ? '✓' : ''; });
  $('googleConnectionBadge').textContent = s.calendar.connected ? 'Connected' : 'Not connected';
  $('googleConnectionBadge').classList.toggle('on',s.calendar.connected);
  $('googleNext').disabled = !s.calendar.connected;
  if (s.calendar.hasClient && !guideHasClient) $('googleGuide').open = false;
  guideHasClient = s.calendar.hasClient;
  $('clientFileStatus').textContent = s.calendar.hasClient ? 'Connection file imported and stored in Keychain.' : 'Choose the JSON you just downloaded.';
  $('setupBrowserStatus').textContent = s.browser.verified ? '✓ Room Google account verified.' : 'Sign in to room Chrome, then choose Check account.';
  $('setupBrowserStatus').classList.toggle('success',s.browser.verified);
  $('devicesNext').disabled = !s.browser.verified;
  $('dropNext').disabled = !(s.settings.dropInEnabled && s.dropIn.connected);
  $('skipDrop').hidden = Boolean(s.settings.dropInEnabled);
  if (!dirtyForms.has('brandForm')) $('brandedUrl').value = p.brandedUrl;
  for (const id of ['devicesConfirmed','visitConfirmed','linkConfirmed']) if (!setupDirty.has(id)) $(id).checked = p[id];
  $('brandPreview').textContent = ($('brandedUrl').value || 'https://meet.yourcompany.com/miami').replace(/^https:\/\//,'');
  $('downloadRedirect').disabled = !p.brandedUrl || !s.settings.dropInEnabled;
  $('brandNext').disabled = !p.brandedUrl;
  $('brandPrerequisite').textContent = s.settings.dropInEnabled ? 'Your saved Meet room is ready for a redirect.' : 'Enable a drop-in room in step 4 first, or skip this optional step.';
  $('overviewName').textContent = s.name || 'The Portal';
  $('sharedRoomLink').hidden = !s.settings.dropInEnabled;
  $('sharedRoomAddress').textContent = (p.linkConfirmed ? p.brandedUrl : '') || s.settings.dropInUrl || '';
  $('globalStatus').replaceChildren();
  const dot = document.createElement('span'); dot.className = 'status-dot';
  dot.classList.toggle('live',Boolean(s.health?.healthy));
  $('globalStatus').append(dot,document.createTextNode(s.settings.paused ? 'Auto-join is paused' : s.active ? 'Meeting in progress' : s.health?.healthy ? 'Room is ready' : 'Room needs attention'));
  $('roomLiveDot').classList.toggle('live',Boolean(s.health?.healthy));
  $('setupReview').replaceChildren();
  const rows = [['Room',s.name],['Google account',s.calendar.connected ? s.email : 'Not connected'],['Room browser',s.browser.verified ? 'Account verified' : 'Needs sign-in'],['Devices',p.devicesConfirmed ? 'Confirmed by you' : 'Not checked'],['Drop-ins',s.settings.dropInEnabled ? 'Enabled' : 'Not enabled (optional)'],['Team address',p.brandedUrl ? (p.linkConfirmed ? p.brandedUrl : 'Redirect not confirmed') : 'Google Meet link / optional']];
  for (const [label,value] of rows) {
    const row = document.createElement('div'); row.className = 'review-row';
    const name = document.createElement('span'); name.textContent = label;
    const detail = document.createElement('strong'); detail.textContent = value || 'Not set'; row.append(name,detail); $('setupReview').append(row);
  }
  const ready = Boolean(s.calendar.connected && s.browser.verified && p.devicesConfirmed && (!p.brandedUrl || p.linkConfirmed));
  $('finishSetup').disabled = !ready;
  $('readyBlocker').textContent = ready ? 'Enable auto-join after confirming your live call below. Then test an automatic arrival and departure.' : 'Finish Google sign-in, device confirmation, and any saved branded-link check first.';
  $('savedNote').textContent = s.active ? 'Meeting in progress' : dirtyForms.size || setupDirty.size ? 'Unsaved changes' : 'Saved on this Mac';
  if (!setupInitialized) {
    setupInitialized = true;
    if (p.completed || s.active) showOverview();
    else { const next = progress.findIndex(done => !done); showStep(Math.max(0,next),false); }
  }
}
async function saveSetup(values) {
  const ok = await action('setup',values);
  if (ok) { for (const k of Object.keys(values)) setupDirty.delete(k); if (state) renderSetup(state); }
  return ok;
}
for (const b of document.querySelectorAll('[data-step]')) b.onclick = () => showStep(Number(b.dataset.step));
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => showStep(Number(b.dataset.back));
$('showOverview').onclick = showOverview;
$('editSetup').onclick = () => showStep(0);
$('googleNext').onclick = () => { if (state?.calendar.connected) showStep(2); };
$('devicesNext').onclick = async () => {
  if (!$('devicesConfirmed').checked) return toast('Check your camera, microphone and speaker in Meet, then confirm the check.',true);
  if (await saveSetup({devicesConfirmed:true})) showStep(3);
};
$('dropNext').onclick = () => { if (state?.settings.dropInEnabled && state?.dropIn.connected) showStep(4); };
$('skipDrop').onclick = () => showStep(5);
$('brandForm').onsubmit = async e => {
  e.preventDefault();
  if (await action('setup',{brandedUrl:$('brandedUrl').value},'brandForm')) { setupDirty.delete('linkConfirmed'); renderSetup(state); }
};
$('brandedUrl').addEventListener('input', () => { $('brandPreview').textContent = $('brandedUrl').value.replace(/^https:\/\//,'') || 'meet.yourcompany.com/miami'; });
$('brandNext').onclick = async () => {
  if (dirtyForms.has('brandForm')) return toast('Save your address before confirming its redirect.',true);
  if (!$('linkConfirmed').checked) return toast('Open your branded URL and confirm it reaches the right Meet, or skip it for now.',true);
  if (await saveSetup({linkConfirmed:true})) showStep(5);
};
$('skipBrand').onclick = async () => {
  if (!getSetup(state).brandedUrl || await saveSetup({brandedUrl:'',linkConfirmed:false})) { dirtyForms.delete('brandForm'); setupDirty.delete('linkConfirmed'); renderSetup(state); showStep(5); }
};
for (const id of ['devicesConfirmed','visitConfirmed','linkConfirmed']) $(id).addEventListener('change', () => setupDirty.add(id));
$('finishSetup').onclick = async () => {
  if (!$('visitConfirmed').checked) return toast('Make a real test call and confirm two-way audio and video first.',true);
  if (await action('setup/finish',{visitConfirmed:true})) { showOverview(); toast('Auto-join is enabled. Now test an invitation or drop-in from another device.'); }
};
function redirectConfiguration(s) {
  const p = getSetup(s), u = new URL(p.brandedUrl);
  if (!p.brandedUrl || !s.settings.dropInEnabled || !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(s.settings.dropInUrl)) throw new Error('Save a branded address and an enabled Google Meet room first.');
  return {$schema:'https://openapi.vercel.sh/vercel.json',redirects:[u.pathname,u.pathname+'/'].map(source=>({source,destination:s.settings.dropInUrl,permanent:false}))};
}
$('downloadRedirect').onclick = () => {
  try {
    if (dirtyForms.has('brandForm')) throw new Error('Save your address before downloading its redirect.');
    const blob = new Blob([JSON.stringify(redirectConfiguration(state),null,2)+'\n'],{type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'vercel.json'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Redirect downloaded. Add it to a separate private hosting project, then follow the publishing guide.');
  } catch (e) { toast(e.message,true); }
};
$('copyRoomLink').onclick = async () => { try { await navigator.clipboard.writeText((getSetup(state).linkConfirmed ? getSetup(state).brandedUrl : '') || state.settings.dropInUrl); toast('Room link copied.'); } catch { toast('Copy the room address shown above.',true); } };

try { for (const zone of Intl.supportedValuesOf('timeZone')) { const o = document.createElement('option'); o.value = zone; $('timeZones').append(o); } } catch {}
document.addEventListener('portal:state', e => renderSetup(e.detail));
document.addEventListener('portal:action', e => {
  if (e.detail.name === 'room' && !showingOverview) showStep(1);
  if (e.detail.name === 'drop-in' && state.settings.dropInEnabled && !showingOverview) showStep(4);
  if (e.detail.name === 'disconnect') { setupDirty.clear(); showStep(0); }
});
if (state) renderSetup(state);
// A cosmetic, local-only screen adjustment. It never changes room audio or devices.
try { const savedGlow=Number(localStorage.getItem('portal-screen-glow')); if(savedGlow>=85&&savedGlow<=115) $('screenGlow').value=String(savedGlow); } catch {}
function applyScreenGlow(){ document.querySelector('.app-main').style.setProperty('--screen-glow',String(Number($('screenGlow').value)/100)); }
$('screenGlow').addEventListener('input',()=>{ applyScreenGlow(); try { localStorage.setItem('portal-screen-glow',$('screenGlow').value); } catch {} });
applyScreenGlow();
document.addEventListener('input',event=>{if(event.target.closest('form')) $('savedNote').textContent='Unsaved changes';});
