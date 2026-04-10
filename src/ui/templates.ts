export const INBOX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0d1117">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="agentmail">
<link rel="apple-touch-icon" href="/icon-192.png">
<title>agentmail inbox</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg0:#0d1117;--bg1:#161b22;--bg2:#21262d;--bg3:#30363d;
  --tx0:#e6edf3;--tx1:#8b949e;--tx2:#484f58;
  --ac:#58a6ff;--green:#238636;--blue:#1f6feb
}
html,body{height:100%;overflow:hidden}
body{font:13px/1.4 'SF Mono','Cascadia Code','Fira Code','Menlo',monospace;background:var(--bg0);color:var(--tx0)}
.app{display:grid;grid-template-columns:240px 340px 1fr;height:100vh}
.app.fullwidth{grid-template-columns:240px 1fr}
.app.fullwidth #panel-mid{display:none}
.panel{border-right:1px solid var(--bg3);display:flex;flex-direction:column;overflow:hidden}
.panel:last-child{border-right:none}
.panel-head{padding:14px 16px;border-bottom:1px solid var(--bg3);background:var(--bg1);flex-shrink:0}
.panel-head h2{font-size:14px;font-weight:600}
.panel-head .sub{font-size:11px;color:var(--tx1);margin-top:2px}
.panel-body{flex:1;overflow-y:auto}
.section-label{padding:8px 16px 4px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2)}
.item{padding:10px 16px;border-bottom:1px solid var(--bg3);cursor:pointer;transition:background .1s}
.item:hover{background:var(--bg2)}
.item.active{background:var(--bg2);border-left:3px solid var(--ac);padding-left:13px}
.item .pri{color:var(--tx0);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .sec{color:var(--tx1);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .meta{color:var(--tx2);font-size:10px;margin-top:2px}
.back-btn{padding:8px 16px;font-size:11px;color:var(--ac);cursor:pointer;border-bottom:1px solid var(--bg3)}
.back-btn:hover{background:var(--bg2)}
.msg{padding:16px;border-bottom:1px solid var(--bg3)}
.msg-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;text-transform:uppercase;color:#fff}
.badge-in{background:var(--blue)}.badge-out{background:var(--green)}
.msg-meta{font-size:11px;color:var(--tx1);line-height:1.6}
.msg-meta b{color:var(--tx2);font-weight:normal}
.msg-body{margin-top:10px;padding:12px;background:var(--bg1);border:1px solid var(--bg3);border-radius:4px;white-space:pre-wrap;word-wrap:break-word;font-size:12px;line-height:1.5;max-height:600px;overflow:auto}
.msg-body iframe{width:100%;border:none;background:#fff;border-radius:2px}
.msg-attachments{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
.msg-attach{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--bg2);border:1px solid var(--bg3);border-radius:3px;font-size:11px;color:var(--ac);text-decoration:none;cursor:pointer}
.msg-attach:hover{background:var(--bg3)}
.msg-attach .attach-size{color:var(--tx2);font-size:10px}
.empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--tx2);font-size:13px}
.nav-badge{display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:#da3633;color:#fff;margin-left:4px}
.status-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px;border-bottom:1px solid var(--bg3)}
.status-card{padding:10px;background:var(--bg2);border:1px solid var(--bg3);border-radius:4px;text-align:center}
.status-card .sc-count{font-size:22px;font-weight:700;color:var(--tx0)}
.status-card .sc-label{font-size:10px;color:var(--tx1);text-transform:uppercase;margin-top:2px}
.status-card.sc-warn .sc-count{color:#d29922}
.status-card.sc-error .sc-count{color:#da3633}
.status-card.sc-ok .sc-count{color:#3fb950}
.status-card.sc-info .sc-count{color:var(--ac)}
.btn-row{padding:8px 16px;display:flex;gap:8px;border-bottom:1px solid var(--bg3)}
.btn{padding:6px 12px;border:1px solid var(--bg3);border-radius:4px;background:var(--bg2);color:var(--tx0);font-size:11px;font-family:inherit;cursor:pointer}
.btn:hover{background:var(--bg3)}.btn-warn{border-color:#d29922;color:#d29922}.btn-danger{border-color:#da3633;color:#da3633}
.dispatch-pill{display:inline-block;padding:1px 5px;border-radius:2px;font-size:9px;font-weight:600;text-transform:uppercase}
.dispatch-pill.dp-succeeded{background:#238636;color:#fff}
.dispatch-pill.dp-pending{background:#d29922;color:#fff}
.dispatch-pill.dp-running{background:#1f6feb;color:#fff}
.dispatch-pill.dp-failed{background:#da3633;color:#fff}
.dispatch-pill.dp-deadletter{background:#6e40c9;color:#fff}
.item .error-line{color:#da3633;font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.token-bar{display:flex;gap:12px;padding:8px 16px;border-bottom:1px solid var(--bg3);background:var(--bg1);font-size:11px;color:var(--tx1);flex-wrap:wrap}
.token-bar .tk{display:flex;align-items:center;gap:4px}
.token-bar .tk b{color:var(--tx0);font-weight:600}
.token-bar .tk .cost{color:#3fb950}
.profile-badge{display:inline-block;padding:1px 5px;background:var(--bg3);border-radius:2px;font-size:10px;color:var(--tx1);margin-right:4px}
/* Dashboard */
.dash{padding:24px}
.dash-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.dash-card{padding:16px;background:var(--bg1);border:1px solid var(--bg3);border-radius:6px;text-align:center}
.dash-card .dc-val{font-size:28px;font-weight:700;color:var(--tx0);line-height:1.2}
.dash-card .dc-label{font-size:10px;color:var(--tx2);text-transform:uppercase;margin-top:4px;letter-spacing:.5px}
.dash-card.dc-green .dc-val{color:#3fb950}
.dash-card.dc-orange .dc-val{color:#d29922}
.dash-card.dc-red .dc-val{color:#da3633}
.dash-card.dc-blue .dc-val{color:var(--ac)}
.dash-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.dash-section{background:var(--bg1);border:1px solid var(--bg3);border-radius:6px;overflow:hidden}
.dash-section.full{grid-column:1/-1}
.dash-section h3{font-size:12px;font-weight:600;padding:12px 16px;border-bottom:1px solid var(--bg3);color:var(--tx1);text-transform:uppercase;letter-spacing:.3px}
.dash-table{width:100%;border-collapse:collapse;font-size:11px}
.dash-table th{text-align:left;padding:8px 14px;border-bottom:1px solid var(--bg3);color:var(--tx2);font-size:10px;text-transform:uppercase;font-weight:500}
.dash-table td{padding:8px 14px;border-bottom:1px solid var(--bg3);color:var(--tx0)}
.dash-table tr:hover{background:var(--bg2)}
.dash-table tr:last-child td{border-bottom:none}
.dash-table .num{text-align:right;font-variant-numeric:tabular-nums}
.dash-table .cost{color:#3fb950;font-weight:600}
/* Activity log */
.log-entry{padding:10px 20px;border-bottom:1px solid var(--bg3);font-size:11px;display:flex;gap:12px;align-items:baseline}
.log-entry .log-time{color:var(--tx2);white-space:nowrap;min-width:140px}
.log-entry .log-action{font-weight:600;min-width:120px}
.log-entry.log-error .log-action{color:#da3633}
.log-entry.log-info .log-action{color:#3fb950}
.log-entry .log-msg{color:var(--tx1);flex:1;overflow:hidden;text-overflow:ellipsis}
.log-entry .log-extra{color:var(--tx2);font-size:10px}
.cfg-card{background:var(--bg1);border:1px solid var(--bg3);border-radius:6px;padding:16px;margin-bottom:12px}
.cfg-card h4{font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.cfg-card .cfg-row{display:flex;gap:8px;font-size:11px;padding:3px 0;color:var(--tx1)}
.cfg-card .cfg-row .cfg-key{color:var(--tx2);min-width:120px}
.cfg-card .cfg-row .cfg-val{color:var(--tx0);word-break:break-all}
.cfg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
.cfg-ok{color:#3fb950}.cfg-warn{color:#d29922}.cfg-err{color:#da3633}
.cfg-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.cfg-dot.green{background:#3fb950}.cfg-dot.red{background:#da3633}.cfg-dot.yellow{background:#d29922}.cfg-dot.gray{background:var(--tx2)}
.tab-bar{display:flex;gap:0;border-bottom:1px solid var(--bg3);padding:0 16px;background:var(--bg1)}
.tab{padding:10px 16px;font-size:12px;color:var(--tx1);cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.tab:hover{color:var(--tx0)}
.tab.active{color:var(--ac);border-bottom-color:var(--ac)}
.inline-form{display:flex;gap:6px;align-items:center;margin-top:6px}
.inline-form input,.inline-form select{padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit}
.inline-form button{padding:4px 10px;background:var(--bg2);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;cursor:pointer;font-family:inherit}
.inline-form button:hover{background:var(--bg3)}
.log-viewer{background:var(--bg0);padding:12px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;font-family:inherit;max-height:calc(100vh - 200px);overflow:auto}
.log-viewer .log-line-err{color:#da3633}
.log-viewer .log-line-warn{color:#d29922}
.cfg-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.cfg-actions .btn{font-size:10px;padding:4px 10px}
.cfg-expand{margin-top:8px;padding:8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;font-size:11px;white-space:pre-wrap;word-wrap:break-word;max-height:300px;overflow:auto;display:none}
.cfg-expand.open{display:block}
.cfg-feedback{font-size:10px;padding:4px 8px;border-radius:3px;margin-top:6px;display:inline-block}
.cfg-feedback.ok{background:#238636;color:#fff}
.cfg-feedback.err{background:#da3633;color:#fff}
.svc-table td,.svc-table th{font-size:11px}
.svc-actions{display:flex;gap:8px;padding:12px 16px}
.db-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px}
.test-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100}
.test-modal-inner{background:var(--bg1);border:1px solid var(--bg3);border-radius:6px;padding:20px;width:400px;max-width:90vw}
.test-modal-inner h4{font-size:13px;margin-bottom:12px}
.test-modal-inner label{display:block;font-size:11px;color:var(--tx1);margin-top:8px;margin-bottom:2px}
.test-modal-inner input,.test-modal-inner textarea{width:100%;padding:6px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:12px inherit;font-family:inherit;box-sizing:border-box}
.test-modal-inner textarea{height:80px;resize:vertical}
.test-modal-btns{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--bg3);border-radius:3px}
.mobile-only{display:none}
@media(max-width:768px){
  .mobile-only{display:block}
  .app{display:block;height:100vh;height:100dvh;overflow:hidden}
  .app.fullwidth{display:block}
  .app.fullwidth #panel-mid{display:none}
  .panel{display:none;width:100vw;height:100vh;height:100dvh;border-right:none}
  .panel.mobile-visible{display:flex}
  .back-btn{padding:12px 16px;font-size:12px}
  .item{padding:14px 16px;min-height:44px}
  .status-cards{grid-template-columns:repeat(2,1fr)}
  .dash-summary{grid-template-columns:repeat(2,1fr)}
  .dash-row{grid-template-columns:1fr}
  .cfg-grid{grid-template-columns:1fr}
  .db-stats-grid{grid-template-columns:1fr}
  .log-entry{flex-wrap:wrap}
  .log-entry .log-time{min-width:auto}
  .log-entry .log-action{min-width:auto}
  .dash{padding:12px}
  .dash-section{overflow-x:auto}
  .dash-table th,.dash-table td{padding:6px 10px}
  .token-bar{font-size:10px}
  .cfg-card .cfg-row{flex-wrap:wrap}
  .tab-bar{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .test-modal-inner{width:95vw}
  .inline-form{flex-wrap:wrap}
  .msg-body{max-height:400px}
  .cfg-expand{max-height:200px}
}
</style>
</head>
<body>
<div class="app" id="app">
  <div class="panel" id="panel-sidebar">
    <div class="panel-head"><h2>agentmail</h2><div class="sub">inbox viewer</div></div>
    <div class="panel-body">
      <div class="section-label">Profiles</div>
      <div id="profiles"></div>
      <div class="section-label" style="margin-top:8px">Views</div>
      <div class="item" data-action="select-senders" id="senders-nav">
        <div class="pri">All Senders</div>
        <div class="sec">Cross-profile sender view</div>
      </div>
      <div class="item" data-action="select-dispatch" id="dispatch-nav">
        <div class="pri">Dispatch Queue <span id="dispatch-badge" class="nav-badge" style="display:none"></span></div>
        <div class="sec">Agent delivery status</div>
      </div>
      <div class="item" data-action="select-usage" id="usage-nav">
        <div class="pri">Usage &amp; Costs</div>
        <div class="sec">Tokens, credits per user &amp; agent</div>
      </div>
      <div class="item" data-action="select-activity" id="activity-nav">
        <div class="pri">Activity Log</div>
        <div class="sec">Bridge dispatch events</div>
      </div>
      <div class="item" data-action="select-config" id="config-nav">
        <div class="pri">Configuration</div>
        <div class="sec">Profiles, agents, services</div>
      </div>
    </div>
  </div>
  <div class="panel" id="panel-mid">
    <div class="back-btn mobile-only" data-action="back-to-sidebar">&larr; Back</div>
    <div class="panel-head"><h2 id="mid-title">Select a profile</h2><div class="sub" id="mid-sub"></div></div>
    <div class="panel-body" id="mid-body"><div class="empty">Select a profile or view senders</div></div>
  </div>
  <div class="panel" id="panel-right">
    <div class="back-btn mobile-only" data-action="back-to-mid">&larr; Back</div>
    <div class="panel-head" id="right-head"><h2 id="right-title">Messages</h2><div class="sub" id="right-sub"></div></div>
    <div class="panel-body" id="right-body"><div class="empty">Select a conversation</div></div>
  </div>
</div>
<script>
(function(){
  var state = { view: null, profileId: null, sessionId: null, senderEmail: null };

  var isMobile = window.matchMedia('(max-width:768px)').matches;
  window.matchMedia('(max-width:768px)').addEventListener('change', function(e) {
    isMobile = e.matches;
    if (!isMobile) {
      var panels = document.querySelectorAll('.panel');
      for (var i = 0; i < panels.length; i++) panels[i].classList.remove('mobile-visible');
    } else {
      showPanel('panel-sidebar');
    }
  });
  function showPanel(panelId) {
    if (!isMobile) return;
    var panels = document.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i++) panels[i].classList.toggle('mobile-visible', panels[i].id === panelId);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function enc(s) { return encodeURIComponent(s); }
  function fmtDate(s) {
    if (!s) return '';
    try { var d = new Date(s); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(); }
    catch (e) { return s; }
  }
  function toB64(s) {
    try { return btoa(unescape(encodeURIComponent(s))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }
    catch (e) { return ''; }
  }
  function api(url) { return fetch(url).then(function(r) { return r.json(); }); }
  function fmtTokens(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  function fmtSize(bytes) {
    if (!bytes || bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function card(count, label, cls) {
    return '<div class="status-card ' + cls + '"><div class="sc-count">' + count + '</div><div class="sc-label">' + label + '</div></div>';
  }
  function setActive(container, attr, val) {
    var items = container.querySelectorAll('.item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute(attr) === val);
  }
  function clearSidebarActive() {
    var all = document.querySelectorAll('#panel-sidebar .item');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
  }
  function setFullwidth(on) {
    document.getElementById('app').classList.toggle('fullwidth', on);
    var rh = document.getElementById('right-head');
    rh.style.display = (on && !isMobile) ? 'none' : '';
  }
  function resetPanels() {
    setFullwidth(false);
    document.getElementById('mid-title').textContent = '';
    document.getElementById('mid-sub').textContent = '';
    document.getElementById('right-title').textContent = 'Messages';
    document.getElementById('right-sub').textContent = '';
    document.getElementById('right-body').innerHTML = '<div class="empty">Select a conversation</div>';
  }

  // --- Init ---
  function init() {
    api('/api/profiles').then(function(profiles) {
      var el = document.getElementById('profiles');
      var html = '';
      for (var i = 0; i < profiles.length; i++) {
        var p = profiles[i];
        html += '<div class="item" data-action="select-profile" data-id="' + esc(p.id) + '">'
          + '<div class="pri">' + esc(p.id) + '</div>'
          + '<div class="sec">' + esc(p.accountEmail) + '</div></div>';
      }
      el.innerHTML = html;
    });
  }

  // --- Three-panel views ---
  function selectProfile(id) {
    state = { view: 'profile', profileId: id, sessionId: null, senderEmail: null };
    resetPanels(); clearSidebarActive();
    setActive(document.getElementById('profiles'), 'data-id', id);
    document.getElementById('mid-title').textContent = id;
    document.getElementById('mid-sub').textContent = 'Conversations';
    api('/api/profiles/' + enc(id) + '/sessions').then(renderSessions);
    if (isMobile) showPanel('panel-mid');
  }
  function renderSessions(sessions) {
    var el = document.getElementById('mid-body');
    if (!sessions.length) { el.innerHTML = '<div class="empty">No conversations</div>'; return; }
    var html = '';
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      html += '<div class="item" data-action="select-session" data-id="' + esc(s.sessionId)
        + '" data-peer="' + esc(s.peerEmail) + '">'
        + '<div class="pri">' + (s.profileId && state.view !== 'profile'
          ? '<span class="profile-badge">' + esc(s.profileId) + '</span>' : '')
        + esc(s.peerEmail) + '</div>'
        + '<div class="sec">' + s.messageCount + ' message' + (s.messageCount !== 1 ? 's' : '')
        + (s.lastSubject ? ' &middot; ' + esc(s.lastSubject) : '') + '</div>'
        + '<div class="meta">' + fmtDate(s.lastMessageAt) + '</div></div>';
    }
    el.innerHTML = html;
  }
  function selectSendersView() {
    state = { view: 'senders', profileId: null, sessionId: null, senderEmail: null };
    resetPanels(); clearSidebarActive();
    document.getElementById('senders-nav').classList.add('active');
    document.getElementById('mid-title').textContent = 'All Senders';
    document.getElementById('mid-sub').textContent = 'Unique external senders';
    if (isMobile) showPanel('panel-mid');
    api('/api/senders').then(function(senders) {
      var el = document.getElementById('mid-body');
      if (!senders.length) { el.innerHTML = '<div class="empty">No senders found</div>'; return; }
      var html = '';
      for (var i = 0; i < senders.length; i++) {
        var s = senders[i];
        html += '<div class="item" data-action="select-sender" data-email="' + esc(s.peerEmail) + '">'
          + '<div class="pri">' + esc(s.peerEmail) + '</div>'
          + '<div class="sec">' + s.totalMessages + ' message' + (s.totalMessages !== 1 ? 's' : '')
          + ' &middot; ' + esc(s.profiles.join(', ')) + '</div>'
          + '<div class="meta">' + fmtDate(s.lastMessageAt) + '</div></div>';
      }
      el.innerHTML = html;
    });
  }
  function selectSender(email) {
    state.view = 'sender-sessions'; state.senderEmail = email; state.sessionId = null;
    document.getElementById('mid-title').textContent = email;
    document.getElementById('mid-sub').textContent = 'Sessions across profiles';
    document.getElementById('right-body').innerHTML = '<div class="empty">Select a session</div>';
    api('/api/senders/' + enc(email) + '/sessions').then(function(sessions) {
      var el = document.getElementById('mid-body');
      var html = '<div class="back-btn" data-action="back-to-senders">&larr; Back to all senders</div>';
      if (!sessions.length) { html += '<div class="empty" style="height:auto;padding:40px">No sessions</div>'; el.innerHTML = html; return; }
      for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        html += '<div class="item" data-action="select-session" data-id="' + esc(s.sessionId)
          + '" data-peer="' + esc(s.peerEmail) + '">'
          + '<div class="pri"><span class="profile-badge">' + esc(s.profileId) + '</span>' + esc(s.peerEmail) + '</div>'
          + '<div class="sec">' + s.messageCount + ' message' + (s.messageCount !== 1 ? 's' : '')
          + (s.lastSubject ? ' &middot; ' + esc(s.lastSubject) : '') + '</div>'
          + '<div class="meta">' + fmtDate(s.lastMessageAt) + '</div></div>';
      }
      el.innerHTML = html;
    });
  }
  function selectSession(id, peer) {
    state.sessionId = id;
    setActive(document.getElementById('mid-body'), 'data-id', id);
    if (isMobile) showPanel('panel-right');
    document.getElementById('right-title').textContent = peer || 'Conversation';
    document.getElementById('right-sub').textContent = id;
    api('/api/sessions/' + enc(id) + '/messages').then(function(messages) {
      var el = document.getElementById('right-body');
      if (!messages.length) { el.innerHTML = '<div class="empty">No messages</div>'; return; }
      var html = '<div id="session-token-bar"></div>';
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i]; var isIn = m.direction === 'received';
        var dpill = '';
        if (isIn && m.dispatchStatus) {
          dpill = '<span class="dispatch-pill dp-' + m.dispatchStatus + '">' + m.dispatchStatus
            + (m.dispatchStatus === 'failed' ? ' (' + (m.dispatchAttempts || 0) + '/4)' : '') + '</span>';
        }
        html += '<div class="msg"><div class="msg-head">'
          + '<span class="badge ' + (isIn ? 'badge-in' : 'badge-out') + '">' + esc(m.direction) + '</span>'
          + dpill
          + '<span style="color:var(--tx1);font-size:11px">' + fmtDate(m.date || m.savedAt) + '</span></div>'
          + '<div class="msg-meta">'
          + '<div><b>from:</b> ' + esc((m.from || []).join(', ')) + '</div>'
          + '<div><b>to:</b> ' + esc((m.to || []).join(', ')) + '</div>'
          + (m.cc && m.cc.length ? '<div><b>cc:</b> ' + esc(m.cc.join(', ')) + '</div>' : '')
          + (m.subject ? '<div><b>subject:</b> ' + esc(m.subject) + '</div>' : '')
          + '</div>'
          + renderAttachments(m.attachments, m.messageDir)
          + '<div class="msg-body" id="body-' + i + '">Loading...</div></div>';
      }
      el.innerHTML = html;
      for (var j = 0; j < messages.length; j++) loadBody(messages[j].messageDir, j);
      loadSessionTokens(peer);
    });
  }
  function loadSessionTokens(peerEmail) {
    if (!peerEmail) return;
    api('/api/openclaw/sessions').then(function(data) {
      var sessions = data.mailSessions || data;
      var match = null;
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].peerEmail === peerEmail) { match = sessions[i]; break; }
      }
      var bar = document.getElementById('session-token-bar');
      if (!bar || !match || !match.totalTokens) return;
      bar.className = 'token-bar';
      bar.innerHTML = '<div class="tk"><b>Agent:</b> ' + esc(match.agentId) + '</div>'
        + '<div class="tk"><b>Model:</b> ' + esc(match.model) + '</div>'
        + '<div class="tk"><b>Turns:</b> ' + (match.turns || 0) + '</div>'
        + '<div class="tk"><b>Input:</b> ' + fmtTokens(match.inputTokens) + '</div>'
        + '<div class="tk"><b>Output:</b> ' + fmtTokens(match.outputTokens) + '</div>'
        + '<div class="tk"><b>Cache R/W:</b> ' + fmtTokens(match.cacheReadTokens) + '/' + fmtTokens(match.cacheWriteTokens) + '</div>'
        + '<div class="tk"><b>Total:</b> ' + fmtTokens(match.totalTokens) + '</div>'
        + '<div class="tk"><b>Cost:</b> <span class="cost">$' + (match.cost || 0).toFixed(4) + '</span></div>';
    }).catch(function() {});
  }
  function renderAttachments(attachments, messageDir) {
    if (!attachments || !attachments.length) return '';
    var b64 = toB64(messageDir); var html = '<div class="msg-attachments">';
    for (var i = 0; i < attachments.length; i++) {
      var a = attachments[i];
      html += '<a class="msg-attach" href="' + esc('/api/messages/attachment?dir=' + b64 + '&path=' + enc(a.relativePath))
        + '" download="' + esc(a.filename) + '">' + esc(a.filename)
        + ' <span class="attach-size">' + fmtSize(a.size) + '</span></a>';
    }
    return html + '</div>';
  }
  function loadBody(dir, idx) {
    api('/api/messages/body?dir=' + toB64(dir)).then(function(body) {
      var el = document.getElementById('body-' + idx); if (!el) return;
      if (body.html) {
        var iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-same-origin';
        iframe.style.cssText = 'width:100%;border:none;background:#fff;border-radius:2px;min-height:60px';
        el.textContent = ''; el.appendChild(iframe); iframe.srcdoc = body.html;
        iframe.onload = function() { try { iframe.style.height = Math.min(iframe.contentDocument.body.scrollHeight + 20, 600) + 'px'; } catch(e){} };
      } else if (body.text) { el.textContent = body.text; }
      else { el.innerHTML = '<span style="color:var(--tx2)">(no body)</span>'; }
    }).catch(function() {
      var el = document.getElementById('body-' + idx);
      if (el) el.innerHTML = '<span style="color:var(--tx2)">(failed to load)</span>';
    });
  }

  // --- Dispatch view (three-panel) ---
  function selectDispatchView() {
    state = { view: 'dispatch', profileId: null, sessionId: null, senderEmail: null };
    resetPanels(); clearSidebarActive();
    document.getElementById('dispatch-nav').classList.add('active');
    document.getElementById('mid-title').textContent = 'Dispatch Queue';
    document.getElementById('mid-sub').textContent = 'Agent delivery pipeline';
    if (isMobile) showPanel('panel-mid');
    document.getElementById('right-body').innerHTML = '<div class="empty">Select a job to view conversation</div>';
    api('/api/dispatch/summary').then(function(s) {
      var el = document.getElementById('mid-body');
      var html = '<div class="status-cards">'
        + card(s.pending, 'Pending', s.pending > 0 ? 'sc-warn' : '')
        + card(s.running, 'Running', s.running > 0 ? 'sc-info' : '')
        + card(s.succeeded, 'Succeeded', s.succeeded > 0 ? 'sc-ok' : '')
        + card(s.failed, 'Failed', s.failed > 0 ? 'sc-error' : '')
        + card(s.deadletter, 'Deadletter', s.deadletter > 0 ? 'sc-error' : '')
        + card(s.stalled, 'Stalled', s.stalled > 0 ? 'sc-error' : '')
        + '</div>';
      if (s.failed > 0 || s.deadletter > 0) {
        html += '<div class="btn-row">'
          + '<button class="btn btn-warn" data-action="retry-failed">Retry Failed (' + s.failed + ')</button>'
          + '<button class="btn btn-danger" data-action="retry-all">Retry All incl. Deadletter (' + (s.failed + s.deadletter) + ')</button></div>';
      }
      html += '<div id="dispatch-queue"></div>';
      el.innerHTML = html;
      api('/api/dispatch/queue?status=failed,deadletter&stalled=true&limit=50').then(function(items) {
        var qEl = document.getElementById('dispatch-queue'); if (!qEl) return;
        if (!items.length) { qEl.innerHTML = '<div class="empty" style="height:auto;padding:40px">No issues in queue</div>'; return; }
        var qhtml = '<div class="section-label">Issues (' + items.length + ')</div>';
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          qhtml += '<div class="item" data-action="select-session" data-id="' + esc(it.sessionId) + '" data-peer="' + esc(it.peerEmail) + '">'
            + '<div class="pri"><span class="dispatch-pill dp-' + it.dispatchStatus + '">' + it.dispatchStatus
            + (it.dispatchStatus === 'failed' ? ' ' + it.dispatchAttempts + '/4' : '') + '</span> '
            + '<span class="profile-badge">' + esc(it.profileId) + '</span>' + esc(it.peerEmail) + '</div>'
            + '<div class="sec">' + (it.subject ? esc(it.subject) : '(no subject)') + '</div>'
            + (it.lastDispatchError ? '<div class="error-line">' + esc(it.lastDispatchError) + '</div>' : '')
            + '<div class="meta">' + fmtDate(it.savedAt) + (it.nextDispatchAt ? ' &middot; retry ' + fmtDate(it.nextDispatchAt) : '') + '</div></div>';
        }
        qEl.innerHTML = qhtml;
      });
    });
  }
  function doRetry(incl) {
    fetch('/api/dispatch/retry' + (incl ? '?include-deadletter=true' : ''), { method: 'POST' })
      .then(function(r) { return r.json(); }).then(function() { selectDispatchView(); updateDispatchBadge(); });
  }
  function updateDispatchBadge() {
    api('/api/dispatch/summary').then(function(s) {
      var count = s.failed + s.deadletter + s.stalled;
      var badge = document.getElementById('dispatch-badge');
      if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
      else { badge.style.display = 'none'; }
    }).catch(function() {});
  }

  // --- Usage dashboard (fullwidth) ---
  function selectUsageView() {
    state = { view: 'usage', profileId: null, sessionId: null, senderEmail: null };
    clearSidebarActive(); setFullwidth(true);
    document.getElementById('usage-nav').classList.add('active');
    if (isMobile) showPanel('panel-right');
    document.getElementById('right-body').innerHTML = '<div class="empty">Loading usage data...</div>';
    Promise.all([
      api('/api/openclaw/sessions'),
      api('/api/apollo/usage'),
      api('/api/openclaw/bindings')
    ]).then(function(r) { renderUsageDashboard(r[0], r[1], r[2]); });
  }
  function renderUsageDashboard(sessionData, apollo, bindings) {
    var el = document.getElementById('right-body');
    var sessions = sessionData.mailSessions || [];
    var related = sessionData.relatedSessions || [];
    var totals = sessionData.totals || null;

    // Compute mail-direct cost
    var directCost = 0, directTokens = 0, directTurns = 0;
    for (var i = 0; i < sessions.length; i++) {
      directCost += sessions[i].cost || 0;
      directTokens += sessions[i].totalTokens || 0;
      directTurns += sessions[i].turns || 0;
    }
    // Compute related cost (CLI/subagent runs by bound agents)
    var relatedCost = 0, relatedTokens = 0, relatedTurns = 0;
    for (var i = 0; i < related.length; i++) {
      relatedCost += related[i].cost || 0;
      relatedTokens += related[i].totalTokens || 0;
      relatedTurns += related[i].turns || 0;
    }
    var totalMailCost = directCost + relatedCost;

    var html = '<div class="dash">';

    // Top-level summary
    html += '<div class="dash-summary">'
      + '<div class="dash-card dc-green"><div class="dc-val">$' + totalMailCost.toFixed(2) + '</div><div class="dc-label">Mail Cost (incl. tooling)</div></div>'
      + '<div class="dash-card dc-blue"><div class="dc-val">' + sessions.length + '</div><div class="dc-label">Mail Conversations</div></div>'
      + '<div class="dash-card dc-orange"><div class="dc-val">' + (sessions.length + related.length) + '</div><div class="dc-label">Total Sessions (mail+tools)</div></div>'
      + '<div class="dash-card dc-red"><div class="dc-val">$' + (totals ? totals.totalCost.toFixed(2) : '0') + '</div><div class="dc-label">All OpenClaw (' + (totals ? totals.totalSessions : 0) + ' sessions)</div></div>'
      + '</div>';

    // Channel breakdown
    if (totals && totals.byChannel && totals.byChannel.length > 1) {
      html += '<div style="display:flex;gap:8px;padding:0 16px 12px;flex-wrap:wrap">';
      for (var c = 0; c < totals.byChannel.length; c++) {
        var ch = totals.byChannel[c];
        html += '<span style="font-size:11px;color:var(--tx1);padding:4px 8px;background:var(--bg1);border:1px solid var(--bg3);border-radius:3px">'
          + esc(ch.channel) + ': <span style="color:#3fb950">$' + ch.cost.toFixed(2) + '</span>'
          + ' <span style="color:var(--tx2)">(' + ch.sessions + ')</span></span>';
      }
      html += '</div>';
    }

    // Aggregate by agent and user — include related sessions (attributed by peerEmail from spawnedBy chain)
    var mailAgentMap = {}, relAgentMap = {}, userMap = {};
    // All sessions combined for user aggregation
    var allMailRelated = sessions.concat(related);
    for (var i = 0; i < allMailRelated.length; i++) {
      var s = allMailRelated[i], aid = s.agentId || 'unknown', email = s.peerEmail || 'unknown';
      if (!userMap[email]) userMap[email] = { peerEmail: email, agents: {}, sessions: 0, tokens: 0, cost: 0 };
      userMap[email].agents[s.agentId] = true;
      userMap[email].sessions++;
      userMap[email].tokens += s.totalTokens || 0;
      userMap[email].cost += s.cost || 0;
    }
    for (var i = 0; i < sessions.length; i++) {
      var aid = sessions[i].agentId || 'unknown';
      if (!mailAgentMap[aid]) mailAgentMap[aid] = { sessions: 0, cost: 0 };
      mailAgentMap[aid].sessions++; mailAgentMap[aid].cost += sessions[i].cost || 0;
    }
    for (var i = 0; i < related.length; i++) {
      var raid = related[i].agentId || 'unknown';
      if (!relAgentMap[raid]) relAgentMap[raid] = { sessions: 0, cost: 0 };
      relAgentMap[raid].sessions++; relAgentMap[raid].cost += related[i].cost || 0;
    }
    var users = Object.values(userMap).sort(function(a, b) { return b.cost - a.cost; });

    // Build agent rows with total / direct mail / related / telegram breakdown
    var agentRows = [];
    if (totals && totals.byAgent) {
      for (var i = 0; i < totals.byAgent.length; i++) {
        var ta = totals.byAgent[i];
        var ma = mailAgentMap[ta.agentId] || { sessions: 0, cost: 0 };
        var ra = relAgentMap[ta.agentId] || { sessions: 0, cost: 0 };
        agentRows.push({
          agentId: ta.agentId,
          totalSessions: ta.sessions,
          totalCost: ta.cost,
          totalTokens: ta.tokens || 0,
          directCost: ma.cost,
          relatedCost: ra.cost,
          mailOpsCost: ma.cost + ra.cost,
          telegramCost: ta.cost - ma.cost - ra.cost
        });
      }
    }
    agentRows.sort(function(a, b) { return b.totalCost - a.totalCost; });

    html += '<div class="dash-row">';

    // By Agent
    html += '<div class="dash-section"><h3>Cost by Agent</h3><table class="dash-table"><thead><tr>'
      + '<th>Agent</th><th class="num">Sessions</th><th class="num">Tokens</th>'
      + '<th class="num">Mail Ops</th><th class="num">Direct</th><th class="num">CLI/Sub</th><th class="num">Telegram+</th><th class="num">Total</th>'
      + '</tr></thead><tbody>';
    for (var j = 0; j < agentRows.length; j++) {
      var ag = agentRows[j];
      html += '<tr><td><span class="profile-badge">' + esc(ag.agentId) + '</span></td>'
        + '<td class="num">' + ag.totalSessions + '</td>'
        + '<td class="num">' + fmtTokens(ag.totalTokens) + '</td>'
        + '<td class="num cost">$' + ag.mailOpsCost.toFixed(2) + '</td>'
        + '<td class="num" style="color:var(--tx1)">$' + ag.directCost.toFixed(2) + '</td>'
        + '<td class="num" style="color:var(--tx1)">$' + ag.relatedCost.toFixed(2) + '</td>'
        + '<td class="num" style="color:var(--tx2)">$' + Math.max(0, ag.telegramCost).toFixed(2) + '</td>'
        + '<td class="num" style="color:var(--tx2)">$' + ag.totalCost.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // By User
    html += '<div class="dash-section"><h3>Cost by User</h3><table class="dash-table"><thead><tr>'
      + '<th>Peer Email</th><th>Agents</th><th class="num">Sessions</th><th class="num">Tokens</th><th class="num">Cost</th>'
      + '</tr></thead><tbody>';
    for (var j = 0; j < users.length; j++) {
      var u = users[j];
      var badges = Object.keys(u.agents).map(function(a) { return '<span class="profile-badge">' + esc(a) + '</span>'; }).join(' ');
      html += '<tr><td>' + esc(u.peerEmail) + '</td><td>' + badges + '</td>'
        + '<td class="num">' + u.sessions + '</td><td class="num">' + fmtTokens(u.tokens) + '</td>'
        + '<td class="num cost">$' + u.cost.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>';
    html += '</div>'; // close dash-row

    // Full detail table
    var sorted = sessions.slice().sort(function(a, b) { return (b.cost || 0) - (a.cost || 0); });
    html += '<div class="dash-section full"><h3>All Conversations &mdash; Per User Per Agent</h3><table class="dash-table"><thead><tr>'
      + '<th>Peer Email</th><th>Agent</th><th>Model</th>'
      + '<th class="num">Turns</th><th class="num">Input</th><th class="num">Output</th>'
      + '<th class="num">Cache R</th><th class="num">Cache W</th>'
      + '<th class="num">Total</th><th class="num">Cost</th>'
      + '</tr></thead><tbody>';
    for (var j = 0; j < sorted.length; j++) {
      var s = sorted[j];
      html += '<tr><td>' + esc(s.peerEmail) + '</td>'
        + '<td><span class="profile-badge">' + esc(s.agentId) + '</span></td>'
        + '<td style="color:var(--tx1)">' + esc(s.model || '-') + '</td>'
        + '<td class="num">' + (s.turns || 0) + '</td>'
        + '<td class="num">' + fmtTokens(s.inputTokens) + '</td>'
        + '<td class="num">' + fmtTokens(s.outputTokens) + '</td>'
        + '<td class="num">' + fmtTokens(s.cacheReadTokens) + '</td>'
        + '<td class="num">' + fmtTokens(s.cacheWriteTokens) + '</td>'
        + '<td class="num">' + fmtTokens(s.totalTokens) + '</td>'
        + '<td class="num cost">$' + (s.cost || 0).toFixed(4) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // Apollo
    if (apollo.totalCredits > 0 || apollo.recentEntries.length > 0) {
      html += '<div class="dash-section full" style="margin-top:16px"><h3>Apollo.io Credits</h3>';
      html += '<div class="dash-summary" style="padding:16px;margin:0">'
        + '<div class="dash-card dc-orange"><div class="dc-val">' + apollo.totalCredits + '</div><div class="dc-label">Credits Used</div></div>'
        + '<div class="dash-card"><div class="dc-val">' + apollo.totalRecords + '</div><div class="dc-label">Records</div></div>'
        + '<div class="dash-card dc-blue"><div class="dc-val">' + apollo.byAgent.length + '</div><div class="dc-label">Agents</div></div>'
        + '</div>';
      if (apollo.byCallerAgent.length > 0) {
        html += '<table class="dash-table"><thead><tr><th>Caller</th><th>Agent</th><th class="num">Credits</th><th class="num">Records</th><th class="num">Calls</th></tr></thead><tbody>';
        for (var k = 0; k < apollo.byCallerAgent.length; k++) {
          var a = apollo.byCallerAgent[k];
          html += '<tr><td>' + esc(a.callerId) + '</td><td><span class="profile-badge">' + esc(a.agentId) + '</span></td>'
            + '<td class="num">' + a.credits + '</td><td class="num">' + a.records + '</td><td class="num">' + a.calls + '</td></tr>';
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    }

    // Bindings
    if (bindings.length > 0) {
      html += '<div class="dash-section full" style="margin-top:16px"><h3>Dispatch Bindings</h3><table class="dash-table"><thead><tr>'
        + '<th>Profile</th><th>Agent</th><th>Status</th></tr></thead><tbody>';
      for (var b = 0; b < bindings.length; b++) {
        var bd = bindings[b];
        html += '<tr><td>' + esc(bd.profileId) + '</td><td><span class="profile-badge">' + esc(bd.agentId) + '</span></td>'
          + '<td>' + (bd.enabled ? '<span style="color:#3fb950">enabled</span>' : '<span style="color:#da3633">disabled</span>') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }

    html += '</div>'; // close dash
    el.innerHTML = html;
  }

  // --- Activity log (fullwidth) ---
  function selectActivityView() {
    state = { view: 'activity', profileId: null, sessionId: null, senderEmail: null };
    clearSidebarActive(); setFullwidth(true);
    document.getElementById('activity-nav').classList.add('active');
    if (isMobile) showPanel('panel-right');
    document.getElementById('right-body').innerHTML = '<div class="empty">Loading...</div>';
    api('/api/bridge/log?limit=200').then(function(entries) {
      var el = document.getElementById('right-body');
      if (!entries.length) { el.innerHTML = '<div class="empty">No bridge log entries</div>'; return; }
      var html = '<div style="padding:16px 20px 8px"><span style="font-size:14px;font-weight:600">Activity Log</span>'
        + '<span style="color:var(--tx2);font-size:11px;margin-left:12px">' + entries.length + ' events</span></div>';
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i]; var isErr = e.level === 'ERROR';
        html += '<div class="log-entry ' + (isErr ? 'log-error' : 'log-info') + '">'
          + '<span class="log-time">' + fmtDate(e.timestamp) + '</span>'
          + '<span class="log-action">' + esc(e.action) + '</span>'
          + '<span class="log-msg">'
          + (e.profileId ? '<span class="profile-badge">' + esc(e.profileId) + '</span>' : '')
          + (e.peerEmail ? esc(e.peerEmail) + ' &mdash; ' : '')
          + esc(e.message) + '</span>';
        if (e.extra) {
          var parts = [];
          if (e.extra.jobId) parts.push('job=' + e.extra.jobId);
          if (e.extra.subject) parts.push(esc(String(e.extra.subject)));
          if (e.extra.runId) parts.push('run=' + esc(String(e.extra.runId)));
          if (parts.length) html += '<span class="log-extra">' + parts.join(' &middot; ') + '</span>';
        }
        html += '</div>';
      }
      el.innerHTML = html;
    });
  }

  // --- Configuration view (fullwidth, tabbed) ---
  var cfgCache = {};
  var cfgActiveTab = 'health';

  function selectConfigView() {
    state = { view: 'config', profileId: null, sessionId: null, senderEmail: null };
    clearSidebarActive(); setFullwidth(true);
    document.getElementById('config-nav').classList.add('active');
    if (isMobile) showPanel('panel-right');
    cfgActiveTab = 'health';
    document.getElementById('right-body').innerHTML = '<div class="empty">Loading configuration...</div>';
    api('/api/config').then(function(cfg) {
      cfgCache = cfg;
      renderCfgShell();
      renderCfgHealth();
    });
  }

  function renderCfgShell() {
    var el = document.getElementById('right-body');
    var tabs = [
      { id: 'health', label: 'Health' },
      { id: 'profiles', label: 'Profiles' },
      { id: 'services', label: 'Services' },
      { id: 'database', label: 'Database' },
      { id: 'logs', label: 'Logs' }
    ];
    var html = '<div class="tab-bar" id="cfg-tabs">';
    for (var i = 0; i < tabs.length; i++) {
      html += '<div class="tab' + (tabs[i].id === cfgActiveTab ? ' active' : '') + '" data-action="cfg-tab" data-tab="' + tabs[i].id + '">' + tabs[i].label + '</div>';
    }
    html += '</div><div id="cfg-content" style="flex:1;overflow-y:auto"></div>';
    el.innerHTML = html;
  }

  function cfgSwitchTab(tabId) {
    cfgActiveTab = tabId;
    var tabs = document.querySelectorAll('#cfg-tabs .tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabId);
    if (tabId === 'health') renderCfgHealth();
    else if (tabId === 'profiles') renderCfgProfiles();
    else if (tabId === 'services') renderCfgServices();
    else if (tabId === 'database') renderCfgDatabase();
    else if (tabId === 'logs') renderCfgLogs();
  }

  function cfgPost(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r) { return r.json(); });
  }

  function cfgShowFeedback(containerId, msg, ok) {
    var c = document.getElementById(containerId);
    if (!c) return;
    var fb = document.createElement('span');
    fb.className = 'cfg-feedback ' + (ok ? 'ok' : 'err');
    fb.textContent = msg;
    c.appendChild(fb);
    setTimeout(function() { if (fb.parentNode) fb.parentNode.removeChild(fb); }, 3000);
  }

  // --- Health tab ---
  function renderCfgHealth() {
    var el = document.getElementById('cfg-content');
    if (!el) return;
    el.innerHTML = '<div class="dash"><div class="empty">Loading health check...</div></div>';
    Promise.all([
      api('/api/config/doctor').catch(function() { return { ok: false, issues: ['Doctor endpoint unavailable'], profiles: [] }; }),
      api('/api/dispatch/summary').catch(function() { return { pending: 0, running: 0, succeeded: 0, failed: 0, deadletter: 0, stalled: 0 }; })
    ]).then(function(results) {
      var doc = results[0]; var disp = results[1];
      var html = '<div class="dash">';

      // Summary cards
      var overallOk = doc.ok !== false;
      var issueCount = (doc.issues || []).length;
      html += '<div class="dash-summary">'
        + '<div class="dash-card ' + (overallOk ? 'dc-green' : 'dc-red') + '"><div class="dc-val">' + (overallOk ? 'OK' : 'ISSUES') + '</div><div class="dc-label">System Health</div></div>'
        + '<div class="dash-card ' + (issueCount > 0 ? 'dc-orange' : '') + '"><div class="dc-val">' + issueCount + '</div><div class="dc-label">Issues Found</div></div>'
        + '<div class="dash-card ' + (disp.failed > 0 ? 'dc-red' : '') + '"><div class="dc-val">' + disp.failed + '</div><div class="dc-label">Failed Jobs</div></div>'
        + '<div class="dash-card ' + (disp.stalled > 0 ? 'dc-red' : '') + '"><div class="dc-val">' + disp.stalled + '</div><div class="dc-label">Stalled Jobs</div></div>'
        + '</div>';

      // Run Doctor button
      html += '<div class="btn-row"><button class="btn" data-action="cfg-run-doctor">Run Doctor</button></div>';

      // Issues list
      if (doc.issues && doc.issues.length > 0) {
        html += '<div class="dash-section full" style="margin-bottom:16px"><h3>Issues</h3>';
        for (var i = 0; i < doc.issues.length; i++) {
          html += '<div style="padding:8px 16px;border-bottom:1px solid var(--bg3);font-size:11px;color:#da3633">' + esc(doc.issues[i]) + '</div>';
        }
        html += '</div>';
      }

      // Per-profile health cards
      var profiles = doc.profiles || cfgCache.profiles || [];
      if (profiles.length > 0) {
        html += '<h3 style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--tx1)">Profile Health</h3>';
        html += '<div class="cfg-grid">';
        for (var j = 0; j < profiles.length; j++) {
          var p = profiles[j];
          var pid = p.profileId || p.id || 'unknown';
          var healthy = p.healthy !== false && p.envValid !== false;
          html += '<div class="cfg-card"><h4>'
            + '<span class="cfg-dot ' + (healthy ? 'green' : 'red') + '"></span> '
            + esc(pid) + '</h4>';
          if (p.accountEmail) html += '<div class="cfg-row"><span class="cfg-key">Account</span><span class="cfg-val">' + esc(p.accountEmail) + '</span></div>';
          if (p.envValid !== undefined) {
            var envDot = p.envValid ? 'green' : (p.envExists ? 'yellow' : 'red');
            html += '<div class="cfg-row"><span class="cfg-key">Env</span><span class="cfg-val"><span class="cfg-dot ' + envDot + '" style="width:6px;height:6px"></span> ' + (p.envValid ? 'valid' : 'issues') + '</span></div>';
          }
          if (p.envIssues && p.envIssues.length > 0) {
            html += '<div class="cfg-row"><span class="cfg-key"></span><span class="cfg-val cfg-err" style="font-size:10px">' + esc(p.envIssues.join('; ')) + '</span></div>';
          }
          html += '<div class="cfg-row"><span class="cfg-key">Polling</span><span class="cfg-val">'
            + (p.pollingConfigured ? '<span class="cfg-ok">' + esc(p.pollingMailbox || 'INBOX') + '</span> every ' + (p.pollingInterval || 60) + 's' : '<span class="cfg-warn">not configured</span>')
            + '</span></div>';
          html += '<div class="cfg-row"><span class="cfg-key">Watcher</span><span class="cfg-val" id="watcher-health-' + esc(pid) + '">checking...</span></div>';
          if (p.messageCount) {
            html += '<div class="cfg-row"><span class="cfg-key">Messages</span><span class="cfg-val">' + (p.messageCount.inbound || 0) + ' in / ' + (p.messageCount.outbound || 0) + ' out</span></div>';
          }
          if (p.issues && p.issues.length > 0) {
            for (var k = 0; k < p.issues.length; k++) {
              html += '<div style="font-size:10px;color:#da3633;padding:2px 0">' + esc(p.issues[k]) + '</div>';
            }
          }
          html += '</div>';
          // Load watcher info for this profile
          (function(profileId) {
            api('/api/config/watcher/' + enc(profileId)).then(function(w) {
              var wel = document.getElementById('watcher-health-' + profileId);
              if (!wel) return;
              if (w.alive) {
                wel.innerHTML = '<span class="cfg-ok">PID ' + (w.pid || '?') + '</span>' + (w.uptime ? ' &middot; up ' + w.uptime : '');
              } else {
                wel.innerHTML = '<span style="color:var(--tx2)">stopped</span>' + (w.pid ? ' (stale PID ' + w.pid + ')' : '');
              }
            }).catch(function() {
              var wel = document.getElementById('watcher-health-' + profileId);
              if (wel) wel.innerHTML = '<span style="color:var(--tx2)">unknown</span>';
            });
          })(pid);
        }
        html += '</div>';
      }

      // Dispatch queue summary
      html += '<div class="dash-section full" style="margin-top:16px"><h3>Dispatch Queue</h3>';
      html += '<div style="display:flex;gap:16px;padding:12px 16px;font-size:11px">'
        + '<span>Pending: <b style="color:#d29922">' + disp.pending + '</b></span>'
        + '<span>Running: <b style="color:var(--ac)">' + disp.running + '</b></span>'
        + '<span>Succeeded: <b style="color:#3fb950">' + disp.succeeded + '</b></span>'
        + '<span>Failed: <b style="color:#da3633">' + disp.failed + '</b></span>'
        + '<span>Deadletter: <b style="color:#6e40c9">' + disp.deadletter + '</b></span>'
        + '<span>Stalled: <b style="color:#da3633">' + disp.stalled + '</b></span>'
        + '</div></div>';

      html += '</div>';
      el.innerHTML = html;
    });
  }

  // --- Profiles tab ---
  function renderCfgProfiles() {
    var el = document.getElementById('cfg-content');
    if (!el) return;
    el.innerHTML = '<div class="dash"><div class="empty">Loading profiles...</div></div>';
    api('/api/config').then(function(cfg) {
      cfgCache = cfg;
      var profiles = cfg.profiles || [];
      var html = '<div class="dash">';
      html += '<div style="padding:0 0 16px;display:flex;gap:8px;align-items:center">'
        + '<button class="btn" data-action="cfg-show-create" style="font-size:12px;padding:6px 14px">+ Create Account</button>'
        + '<span id="create-feedback"></span></div>';
      html += '<div id="create-form-wrap"></div>';
      html += '<div class="cfg-grid">';
      for (var i = 0; i < profiles.length; i++) {
        var p = profiles[i];
        var pid = p.profileId;
        var envDot = p.envValid ? 'green' : (p.envExists ? 'yellow' : 'red');
        html += '<div class="cfg-card" id="cfg-profile-' + esc(pid) + '"><h4>'
          + '<span class="cfg-dot ' + envDot + '"></span> '
          + esc(pid)
          + (p.dispatchBinding ? ' <span class="profile-badge">&rarr; ' + esc(p.dispatchBinding.agentId) + '</span>' : '')
          + '</h4>';

        // Account + SMTP/IMAP
        html += '<div class="cfg-row"><span class="cfg-key">Account</span><span class="cfg-val">' + esc(p.accountEmail || '(not configured)') + '</span></div>';
        if (p.smtpHost) html += '<div class="cfg-row"><span class="cfg-key">SMTP</span><span class="cfg-val">' + esc(p.smtpHost) + '</span></div>';
        if (p.imapHost) html += '<div class="cfg-row"><span class="cfg-key">IMAP</span><span class="cfg-val">' + esc(p.imapHost) + '</span></div>';

        // Polling config with inline edit
        html += '<div class="cfg-row"><span class="cfg-key">Polling</span><span class="cfg-val">'
          + (p.pollingConfigured
            ? '<span class="cfg-ok">' + esc(p.pollingMailbox || 'INBOX') + '</span> every ' + (p.pollingInterval || 60) + 's'
            : '<span class="cfg-warn">not configured</span>')
          + '</span></div>';
        html += '<div class="inline-form" id="poll-form-' + esc(pid) + '">'
          + '<input type="text" placeholder="mailbox" value="' + esc(p.pollingMailbox || 'INBOX') + '" style="width:80px" id="poll-mb-' + esc(pid) + '">'
          + '<input type="number" placeholder="sec" value="' + (p.pollingInterval || 60) + '" style="width:60px" id="poll-iv-' + esc(pid) + '">'
          + '<button data-action="cfg-save-polling" data-profile="' + esc(pid) + '">Save</button>'
          + '</div>';

        // Dispatch binding with inline edit
        html += '<div class="cfg-row"><span class="cfg-key">Dispatch</span><span class="cfg-val">';
        if (p.dispatchBinding) {
          html += '<span class="profile-badge">' + esc(p.dispatchBinding.agentId) + '</span> '
            + (p.dispatchBinding.enabled ? '<span class="cfg-ok">enabled</span>' : '<span class="cfg-err">disabled</span>');
        } else {
          html += '<span style="color:var(--tx2)">none</span>';
        }
        html += '</span></div>';
        html += '<div class="inline-form" id="bind-form-' + esc(pid) + '">'
          + '<input type="text" placeholder="agentId" value="' + esc(p.dispatchBinding ? p.dispatchBinding.agentId : '') + '" style="width:100px" id="bind-agent-' + esc(pid) + '">'
          + '<select id="bind-enabled-' + esc(pid) + '">'
          + '<option value="true"' + (p.dispatchBinding && p.dispatchBinding.enabled ? ' selected' : '') + '>enabled</option>'
          + '<option value="false"' + (p.dispatchBinding && !p.dispatchBinding.enabled ? ' selected' : '') + '>disabled</option>'
          + '</select>'
          + '<button data-action="cfg-save-binding" data-profile="' + esc(pid) + '">Save</button>'
          + '</div>';

        // Hook status with expand
        html += '<div class="cfg-row"><span class="cfg-key">Hook</span><span class="cfg-val">'
          + (p.hookExists ? '<span class="cfg-ok">on_recieve.sh</span>' : '<span style="color:var(--tx2)">none</span>')
          + ' <span style="color:var(--ac);cursor:pointer;font-size:10px" data-action="cfg-toggle-hook" data-profile="' + esc(pid) + '">[view]</span>'
          + '</span></div>';
        html += '<div class="cfg-expand" id="hook-expand-' + esc(pid) + '"></div>';

        // Watcher status
        html += '<div class="cfg-row"><span class="cfg-key">Watcher</span><span class="cfg-val" id="watcher-prof-' + esc(pid) + '">checking...</span></div>';

        // Messages
        html += '<div class="cfg-row"><span class="cfg-key">Messages</span><span class="cfg-val">'
          + (p.messageCount ? (p.messageCount.inbound || 0) + ' in / ' + (p.messageCount.outbound || 0) + ' out' : '-')
          + '</span></div>';

        // Action buttons
        html += '<div class="cfg-actions" id="cfg-actions-' + esc(pid) + '">'
          + '<button class="btn" data-action="cfg-poll-now" data-profile="' + esc(pid) + '">Poll Now</button>'
          + '<button class="btn" data-action="cfg-rebuild-index" data-profile="' + esc(pid) + '">Rebuild Index</button>'
          + '<button class="btn" data-action="cfg-test-conn" data-profile="' + esc(pid) + '">Test Connection</button>'
          + '<button class="btn" data-action="cfg-view-log" data-profile="' + esc(pid) + '">View Log</button>'
          + '<button class="btn" data-action="cfg-edit-env" data-profile="' + esc(pid) + '">Edit Env</button>'
          + '</div>';

        html += '</div>';

        // Load watcher info
        (function(profileId) {
          api('/api/config/watcher/' + enc(profileId)).then(function(w) {
            var wel = document.getElementById('watcher-prof-' + profileId);
            if (!wel) return;
            if (w.alive) {
              wel.innerHTML = '<span class="cfg-ok">PID ' + (w.pid || '?') + '</span>' + (w.uptime ? ' &middot; up ' + w.uptime : '');
            } else {
              wel.innerHTML = '<span style="color:var(--tx2)">stopped</span>' + (w.pid ? ' (stale PID ' + w.pid + ')' : '');
            }
          }).catch(function() {
            var wel = document.getElementById('watcher-prof-' + profileId);
            if (wel) wel.innerHTML = '<span style="color:var(--tx2)">unknown</span>';
          });
        })(pid);
      }
      html += '</div></div>';
      el.innerHTML = html;
    });
  }

  // --- Services tab ---
  function renderCfgServices() {
    var el = document.getElementById('cfg-content');
    if (!el) return;
    el.innerHTML = '<div class="dash"><div class="empty">Loading services...</div></div>';
    api('/api/config').then(function(cfg) {
      cfgCache = cfg;
      var svcs = cfg.services || [];
      var html = '<div class="dash">';

      // Install/Uninstall buttons
      html += '<div class="svc-actions">'
        + '<button class="btn" data-action="cfg-svc-install">Install Services</button>'
        + '<button class="btn btn-danger" data-action="cfg-svc-uninstall">Uninstall Services</button>'
        + '<span id="svc-feedback"></span>'
        + '</div>';

      // Services table
      html += '<div class="dash-section full"><h3>Launchd Services (' + svcs.length + ')</h3>';
      if (svcs.length === 0) {
        html += '<div class="empty" style="height:auto;padding:20px">No services configured</div>';
      } else {
        html += '<table class="dash-table svc-table"><thead><tr><th>Label</th><th>Kind</th><th>Profile</th><th>Installed</th><th>Loaded</th></tr></thead><tbody>';
        for (var i = 0; i < svcs.length; i++) {
          var sv = svcs[i];
          html += '<tr><td style="font-size:10px">' + esc(sv.label) + '</td>'
            + '<td>' + esc(sv.kind) + '</td>'
            + '<td>' + (sv.profileId ? '<span class="profile-badge">' + esc(sv.profileId) + '</span>' : '-') + '</td>'
            + '<td>' + (sv.installed ? '<span class="cfg-ok">yes</span>' : '<span class="cfg-err">no</span>') + '</td>'
            + '<td>' + (sv.loaded ? '<span class="cfg-ok">yes</span>' : '<span class="cfg-err">no</span>') + '</td></tr>';
        }
        html += '</tbody></table>';
      }
      html += '</div>';

      // Dispatch Worker info
      html += '<div class="dash-row" style="margin-top:16px">';
      html += '<div class="dash-section"><h3>Dispatch Worker</h3>';
      if (cfg.dispatchWorker) {
        html += '<div style="padding:12px 16px">';
        html += '<div class="cfg-row"><span class="cfg-key">Poll Interval</span><span class="cfg-val">' + cfg.dispatchWorker.pollIntervalMs + 'ms</span></div>';
        html += '<div class="cfg-row"><span class="cfg-key">Max Concurrent</span><span class="cfg-val">' + cfg.dispatchWorker.maxConcurrentSessions + ' sessions</span></div>';
        html += '</div>';
      } else {
        html += '<div class="empty" style="height:auto;padding:20px">Not configured</div>';
      }
      html += '</div>';

      // Gateway info
      html += '<div class="dash-section"><h3>Gateway</h3><div style="padding:12px 16px">';
      if (cfg.gatewayPort) {
        html += '<div class="cfg-row"><span class="cfg-key">Port</span><span class="cfg-val">' + cfg.gatewayPort + '</span></div>';
      } else {
        html += '<span style="color:var(--tx2)">Not configured</span>';
      }
      html += '<div class="cfg-row"><span class="cfg-key">Database</span><span class="cfg-val" style="font-size:10px">' + esc(cfg.databasePath) + ' (' + (cfg.databaseSizeMB || '?') + ' MB)</span></div>';
      html += '</div></div>';
      html += '</div>';

      html += '</div>';
      el.innerHTML = html;
    });
  }

  // --- Database tab ---
  function renderCfgDatabase() {
    var el = document.getElementById('cfg-content');
    if (!el) return;
    el.innerHTML = '<div class="dash"><div class="empty">Loading database stats...</div></div>';
    Promise.all([
      api('/api/config/db-stats').catch(function() { return { tables: [], totalSizeMB: null, walSizeMB: null }; }),
      api('/api/config/storage-stats').catch(function() { return { profiles: [] }; }),
      api('/api/config').catch(function() { return cfgCache; })
    ]).then(function(results) {
      var db = results[0]; var storage = results[1]; var cfg = results[2];
      cfgCache = cfg;
      var html = '<div class="dash">';

      // Summary
      html += '<div class="dash-summary">'
        + '<div class="dash-card dc-blue"><div class="dc-val">' + (db.totalSizeMB != null ? db.totalSizeMB + ' MB' : (cfg.databaseSizeMB != null ? cfg.databaseSizeMB + ' MB' : '-')) + '</div><div class="dc-label">Database Size</div></div>'
        + '<div class="dash-card"><div class="dc-val">' + (db.walSizeMB != null ? db.walSizeMB + ' MB' : '-') + '</div><div class="dc-label">WAL Size</div></div>'
        + '<div class="dash-card dc-blue"><div class="dc-val">' + (db.tables ? db.tables.length : '-') + '</div><div class="dc-label">Tables</div></div>'
        + '<div class="dash-card"><div class="dc-val">' + (storage.profiles ? storage.profiles.length : '-') + '</div><div class="dc-label">Profiles on Disk</div></div>'
        + '</div>';

      html += '<div class="db-stats-grid">';

      // Table stats
      html += '<div class="dash-section"><h3>Table Row Counts</h3>';
      if (db.tables && db.tables.length > 0) {
        html += '<table class="dash-table"><thead><tr><th>Table</th><th class="num">Rows</th></tr></thead><tbody>';
        for (var i = 0; i < db.tables.length; i++) {
          html += '<tr><td>' + esc(db.tables[i].name) + '</td><td class="num">' + (db.tables[i].rows != null ? db.tables[i].rows : '-') + '</td></tr>';
        }
        html += '</tbody></table>';
      } else {
        html += '<div class="empty" style="height:auto;padding:20px">No table stats available</div>';
      }
      html += '</div>';

      // Storage stats per profile
      html += '<div class="dash-section"><h3>Disk Usage per Profile</h3>';
      if (storage.profiles && storage.profiles.length > 0) {
        html += '<table class="dash-table"><thead><tr><th>Profile</th><th class="num">Messages</th><th class="num">Sent</th><th class="num">Total</th></tr></thead><tbody>';
        for (var j = 0; j < storage.profiles.length; j++) {
          var sp = storage.profiles[j];
          html += '<tr><td><span class="profile-badge">' + esc(sp.profileId) + '</span></td>'
            + '<td class="num">' + (sp.messagesSize != null ? fmtSize(sp.messagesSize) : '-') + '</td>'
            + '<td class="num">' + (sp.sentSize != null ? fmtSize(sp.sentSize) : '-') + '</td>'
            + '<td class="num">' + (sp.totalSize != null ? fmtSize(sp.totalSize) : '-') + '</td></tr>';
        }
        html += '</tbody></table>';
      } else {
        html += '<div class="empty" style="height:auto;padding:20px">No storage stats available</div>';
      }
      html += '</div>';

      html += '</div>'; // close db-stats-grid

      // Per-profile message counts and rebuild
      var profiles = cfg.profiles || [];
      if (profiles.length > 0) {
        html += '<div class="dash-section full" style="margin-top:16px"><h3>Profile Message Counts</h3>';
        html += '<table class="dash-table"><thead><tr><th>Profile</th><th class="num">Inbound</th><th class="num">Outbound</th><th class="num">Total</th><th>Actions</th></tr></thead><tbody>';
        for (var k = 0; k < profiles.length; k++) {
          var pr = profiles[k];
          var mc = pr.messageCount || { inbound: 0, outbound: 0 };
          html += '<tr><td><span class="profile-badge">' + esc(pr.profileId) + '</span></td>'
            + '<td class="num">' + mc.inbound + '</td>'
            + '<td class="num">' + mc.outbound + '</td>'
            + '<td class="num">' + (mc.inbound + mc.outbound) + '</td>'
            + '<td><button class="btn" style="font-size:10px;padding:2px 8px" data-action="cfg-rebuild-index" data-profile="' + esc(pr.profileId) + '">Rebuild Index</button>'
            + ' <span id="db-rebuild-' + esc(pr.profileId) + '"></span></td></tr>';
        }
        html += '</tbody></table></div>';
      }

      html += '</div>';
      el.innerHTML = html;
    });
  }

  // --- Logs tab ---
  var cfgLogProfile = '';
  var cfgLogType = 'receive';

  function renderCfgLogs() {
    var el = document.getElementById('cfg-content');
    if (!el) return;
    var profiles = cfgCache.profiles || [];
    if (!cfgLogProfile && profiles.length > 0) cfgLogProfile = profiles[0].profileId;
    var html = '<div style="padding:12px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--bg3)">';
    html += '<select id="cfg-log-profile" style="padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit">';
    for (var i = 0; i < profiles.length; i++) {
      html += '<option value="' + esc(profiles[i].profileId) + '"' + (profiles[i].profileId === cfgLogProfile ? ' selected' : '') + '>' + esc(profiles[i].profileId) + '</option>';
    }
    html += '</select>';
    html += '<select id="cfg-log-type" style="padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit">';
    var logTypes = ['receive', 'dispatch', 'bridge'];
    for (var j = 0; j < logTypes.length; j++) {
      html += '<option value="' + logTypes[j] + '"' + (logTypes[j] === cfgLogType ? ' selected' : '') + '>' + logTypes[j] + '</option>';
    }
    html += '</select>';
    html += '<button class="btn" data-action="cfg-refresh-logs">Refresh</button>';
    html += '<span id="cfg-log-status" style="font-size:10px;color:var(--tx2)"></span>';
    html += '</div>';
    html += '<div id="cfg-log-output" class="log-viewer">Loading logs...</div>';
    el.innerHTML = html;
    cfgLoadLogs();
  }

  function cfgLoadLogs() {
    var profileSel = document.getElementById('cfg-log-profile');
    var typeSel = document.getElementById('cfg-log-type');
    if (profileSel) cfgLogProfile = profileSel.value;
    if (typeSel) cfgLogType = typeSel.value;
    var statusEl = document.getElementById('cfg-log-status');
    if (statusEl) statusEl.textContent = 'loading...';
    var output = document.getElementById('cfg-log-output');
    if (output) output.textContent = 'Loading...';
    api('/api/config/logs?profile=' + enc(cfgLogProfile) + '&type=' + enc(cfgLogType) + '&lines=200').then(function(data) {
      var lines = data.lines || data;
      if (statusEl) statusEl.textContent = (Array.isArray(lines) ? lines.length : 0) + ' lines';
      if (!output) return;
      if (!lines || (Array.isArray(lines) && lines.length === 0)) {
        output.textContent = '(no log lines)';
        return;
      }
      var logHtml = '';
      var arr = Array.isArray(lines) ? lines : String(lines).split('\\n');
      for (var i = 0; i < arr.length; i++) {
        var line = String(arr[i]);
        var cls = '';
        if (line.indexOf('ERROR') !== -1 || line.indexOf('error') !== -1) cls = 'log-line-err';
        else if (line.indexOf('WARN') !== -1 || line.indexOf('warn') !== -1) cls = 'log-line-warn';
        logHtml += '<span class="' + cls + '">' + esc(line) + '</span>\\n';
      }
      output.innerHTML = logHtml;
      output.scrollTop = output.scrollHeight;
    }).catch(function(err) {
      if (statusEl) statusEl.textContent = 'error';
      if (output) output.textContent = 'Failed to load logs: ' + (err.message || err);
    });
  }

  // --- Config action handlers ---
  function cfgPollNow(profileId) {
    cfgPost('/api/config/poll-trigger', { profileId: profileId }).then(function(r) {
      cfgShowFeedback('cfg-actions-' + profileId, r.ok !== false ? 'Poll triggered' : (r.error || 'Failed'), r.ok !== false);
    }).catch(function() {
      cfgShowFeedback('cfg-actions-' + profileId, 'Request failed', false);
    });
  }

  function cfgRebuildIndex(profileId) {
    cfgPost('/api/config/index-rebuild', { profileId: profileId }).then(function(r) {
      var fbId = 'cfg-actions-' + profileId;
      if (!document.getElementById(fbId)) fbId = 'db-rebuild-' + profileId;
      cfgShowFeedback(fbId, r.ok !== false ? 'Index rebuilt' : (r.error || 'Failed'), r.ok !== false);
    }).catch(function() {
      cfgShowFeedback('cfg-actions-' + profileId, 'Request failed', false);
    });
  }

  function cfgSavePolling(profileId) {
    var mb = document.getElementById('poll-mb-' + profileId);
    var iv = document.getElementById('poll-iv-' + profileId);
    if (!mb || !iv) return;
    cfgPost('/api/config/polling', {
      profileId: profileId,
      mailbox: mb.value,
      intervalSeconds: parseInt(iv.value, 10) || 60
    }).then(function(r) {
      cfgShowFeedback('poll-form-' + profileId, r.ok !== false ? 'Saved' : (r.error || 'Failed'), r.ok !== false);
    }).catch(function() {
      cfgShowFeedback('poll-form-' + profileId, 'Request failed', false);
    });
  }

  function cfgSaveBinding(profileId) {
    var agentEl = document.getElementById('bind-agent-' + profileId);
    var enabledEl = document.getElementById('bind-enabled-' + profileId);
    if (!agentEl || !enabledEl) return;
    cfgPost('/api/config/binding', {
      profileId: profileId,
      agentId: agentEl.value,
      enabled: enabledEl.value === 'true'
    }).then(function(r) {
      cfgShowFeedback('bind-form-' + profileId, r.ok !== false ? 'Saved' : (r.error || 'Failed'), r.ok !== false);
    }).catch(function() {
      cfgShowFeedback('bind-form-' + profileId, 'Request failed', false);
    });
  }

  function cfgToggleHook(profileId) {
    var expand = document.getElementById('hook-expand-' + profileId);
    if (!expand) return;
    if (expand.classList.contains('open')) {
      expand.classList.remove('open');
      return;
    }
    expand.textContent = 'Loading...';
    expand.classList.add('open');
    api('/api/config/hook/' + enc(profileId)).then(function(data) {
      var content = data.content || data;
      expand.innerHTML = '<pre style="margin:0;font-size:11px;white-space:pre-wrap">' + esc(typeof content === 'string' ? content : JSON.stringify(content, null, 2)) + '</pre>'
        + '<div style="margin-top:8px"><textarea id="hook-edit-' + esc(profileId) + '" style="width:100%;height:120px;padding:6px;background:var(--bg1);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;resize:vertical">' + esc(typeof content === 'string' ? content : '') + '</textarea>'
        + '<button class="btn" style="margin-top:4px" data-action="cfg-save-hook" data-profile="' + esc(profileId) + '">Save Hook</button>'
        + ' <span id="hook-feedback-' + esc(profileId) + '"></span></div>';
    }).catch(function() {
      expand.textContent = 'Failed to load hook content';
    });
  }

  function cfgSaveHook(profileId) {
    var ta = document.getElementById('hook-edit-' + profileId);
    if (!ta) return;
    cfgPost('/api/config/hook/' + enc(profileId), { content: ta.value }).then(function(r) {
      cfgShowFeedback('hook-feedback-' + profileId, r.ok !== false ? 'Saved' : (r.error || 'Failed'), r.ok !== false);
    }).catch(function() {
      cfgShowFeedback('hook-feedback-' + profileId, 'Request failed', false);
    });
  }

  function cfgShowTestModal(profileId) {
    var existing = document.getElementById('test-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.className = 'test-modal';
    modal.id = 'test-modal';
    modal.innerHTML = '<div class="test-modal-inner">'
      + '<h4>Send Test Email</h4>'
      + '<label>Profile</label>'
      + '<input type="text" id="test-profile" value="' + esc(profileId) + '" readonly style="color:var(--tx1)">'
      + '<label>To</label>'
      + '<input type="email" id="test-to" placeholder="recipient@example.com">'
      + '<label>Subject</label>'
      + '<input type="text" id="test-subject" placeholder="Test from agentmail">'
      + '<label>Body</label>'
      + '<textarea id="test-body" placeholder="This is a test email."></textarea>'
      + '<div id="test-feedback"></div>'
      + '<div class="test-modal-btns">'
      + '<button class="btn" data-action="cfg-test-cancel">Cancel</button>'
      + '<button class="btn" style="background:var(--green);border-color:var(--green);color:#fff" data-action="cfg-test-send">Send</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }

  function cfgSendTest() {
    var profEl = document.getElementById('test-profile');
    var toEl = document.getElementById('test-to');
    var subEl = document.getElementById('test-subject');
    var bodyEl = document.getElementById('test-body');
    if (!profEl || !toEl || !subEl || !bodyEl) return;
    cfgPost('/api/config/send-test', {
      profileId: profEl.value,
      to: toEl.value,
      subject: subEl.value,
      text: bodyEl.value
    }).then(function(r) {
      cfgShowFeedback('test-feedback', r.ok !== false ? 'Sent!' : (r.error || 'Failed'), r.ok !== false);
      if (r.ok !== false) {
        setTimeout(function() {
          var m = document.getElementById('test-modal');
          if (m) m.remove();
        }, 1500);
      }
    }).catch(function() {
      cfgShowFeedback('test-feedback', 'Request failed', false);
    });
  }

  function cfgShowCreateForm() {
    var wrap = document.getElementById('create-form-wrap');
    if (!wrap) return;
    if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<div class="cfg-card" style="margin-bottom:16px">'
      + '<h4>Create New Account Profile</h4>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      + '<div><label style="font-size:10px;color:var(--tx2)">Profile Name *</label>'
      + '<input id="ca-name" placeholder="user@domain.com" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">Email (defaults to name)</label>'
      + '<input id="ca-email" placeholder="optional" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">SMTP Host *</label>'
      + '<input id="ca-smtp-host" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">SMTP Port</label>'
      + '<input id="ca-smtp-port" value="465" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">SMTP User *</label>'
      + '<input id="ca-smtp-user" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">SMTP Password *</label>'
      + '<input id="ca-smtp-pass" type="password" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">IMAP Host *</label>'
      + '<input id="ca-imap-host" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">IMAP Port</label>'
      + '<input id="ca-imap-port" value="993" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">IMAP User *</label>'
      + '<input id="ca-imap-user" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">IMAP Password *</label>'
      + '<input id="ca-imap-pass" type="password" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">Mailbox</label>'
      + '<input id="ca-mailbox" value="INBOX" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '<div><label style="font-size:10px;color:var(--tx2)">Agent ID (optional)</label>'
      + '<input id="ca-agent" placeholder="e.g. sales" style="width:100%;padding:4px 8px;background:var(--bg0);border:1px solid var(--bg3);border-radius:3px;color:var(--tx0);font:11px inherit;font-family:inherit;box-sizing:border-box"></div>'
      + '</div>'
      + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center">'
      + '<button class="btn" data-action="cfg-create-submit">Create Profile</button>'
      + '<button class="btn" data-action="cfg-show-create">Cancel</button>'
      + '<span id="create-submit-feedback"></span>'
      + '</div></div>';
  }

  function cfgCreateSubmit() {
    var name = (document.getElementById('ca-name') || {}).value;
    var email = (document.getElementById('ca-email') || {}).value;
    if (!name) { cfgShowFeedback('create-submit-feedback', 'Profile name is required', false); return; }
    var body = {
      name: name,
      email: email || undefined,
      smtpHost: (document.getElementById('ca-smtp-host') || {}).value,
      smtpPort: parseInt((document.getElementById('ca-smtp-port') || {}).value) || 465,
      smtpUser: (document.getElementById('ca-smtp-user') || {}).value,
      smtpPass: (document.getElementById('ca-smtp-pass') || {}).value,
      imapHost: (document.getElementById('ca-imap-host') || {}).value,
      imapPort: parseInt((document.getElementById('ca-imap-port') || {}).value) || 993,
      imapUser: (document.getElementById('ca-imap-user') || {}).value,
      imapPass: (document.getElementById('ca-imap-pass') || {}).value,
      mailbox: (document.getElementById('ca-mailbox') || {}).value || 'INBOX',
      agentId: (document.getElementById('ca-agent') || {}).value || undefined
    };
    if (!body.smtpHost || !body.smtpUser || !body.smtpPass || !body.imapHost || !body.imapUser || !body.imapPass) {
      cfgShowFeedback('create-submit-feedback', 'Fill all required fields (*)', false);
      return;
    }
    cfgShowFeedback('create-submit-feedback', 'Creating...', true);
    cfgPost('/api/config/account-create', body).then(function(r) {
      if (r.error) { cfgShowFeedback('create-submit-feedback', r.error, false); return; }
      cfgShowFeedback('create-submit-feedback', 'Created ' + (r.profile || name), true);
      setTimeout(renderCfgProfiles, 1000);
    }).catch(function(e) {
      cfgShowFeedback('create-submit-feedback', 'Failed: ' + (e.message || e), false);
    });
  }

  function cfgEditEnv(profileId) {
    api('/api/config/env/' + enc(profileId)).then(function(env) {
      var m = document.createElement('div');
      m.className = 'test-modal';
      m.id = 'env-modal';
      var fields = [
        ['Email', 'env-email', env.email || ''],
        ['SMTP Host', 'env-smtp-host', env.smtpHost || ''],
        ['SMTP Port', 'env-smtp-port', env.smtpPort || 465],
        ['SMTP User', 'env-smtp-user', ''],
        ['SMTP Pass', 'env-smtp-pass', ''],
        ['IMAP Host', 'env-imap-host', env.imapHost || ''],
        ['IMAP Port', 'env-imap-port', env.imapPort || 993],
        ['IMAP User', 'env-imap-user', ''],
        ['IMAP Pass', 'env-imap-pass', '']
      ];
      var html = '<div class="test-modal-inner"><h4>Edit Env: ' + esc(profileId) + '</h4>';
      html += '<div style="font-size:10px;color:var(--tx2);margin-bottom:8px">Leave user/pass blank to keep current values</div>';
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var type = f[0].indexOf('Pass') >= 0 ? 'password' : 'text';
        html += '<label>' + esc(f[0]) + '</label>';
        html += '<input id="' + f[1] + '" type="' + type + '" value="' + esc(String(f[2])) + '" placeholder="' + (type === 'password' ? '(unchanged)' : '') + '">';
      }
      html += '<div class="test-modal-btns">'
        + '<button class="btn" data-action="cfg-env-cancel">Cancel</button>'
        + '<button class="btn" data-action="cfg-env-save" data-profile="' + esc(profileId) + '" style="background:var(--green);color:#fff;border-color:var(--green)">Save</button>'
        + '</div><span id="env-feedback"></span></div>';
      m.innerHTML = html;
      document.body.appendChild(m);
    });
  }

  function cfgSaveEnv(profileId) {
    var fields = {};
    var v;
    v = (document.getElementById('env-email') || {}).value; if (v) fields.email = v;
    v = (document.getElementById('env-smtp-host') || {}).value; if (v) fields.smtpHost = v;
    v = (document.getElementById('env-smtp-port') || {}).value; if (v) fields.smtpPort = parseInt(v);
    v = (document.getElementById('env-smtp-user') || {}).value; if (v) fields.smtpUser = v;
    v = (document.getElementById('env-smtp-pass') || {}).value; if (v) fields.smtpPass = v;
    v = (document.getElementById('env-imap-host') || {}).value; if (v) fields.imapHost = v;
    v = (document.getElementById('env-imap-port') || {}).value; if (v) fields.imapPort = parseInt(v);
    v = (document.getElementById('env-imap-user') || {}).value; if (v) fields.imapUser = v;
    v = (document.getElementById('env-imap-pass') || {}).value; if (v) fields.imapPass = v;
    cfgPost('/api/config/env-update', { profileId: profileId, fields: fields }).then(function(r) {
      if (r.error) { cfgShowFeedback('env-feedback', r.error, false); return; }
      cfgShowFeedback('env-feedback', 'Saved!', true);
      setTimeout(function() { var m = document.getElementById('env-modal'); if (m) m.remove(); renderCfgProfiles(); }, 1000);
    }).catch(function(e) {
      cfgShowFeedback('env-feedback', 'Failed', false);
    });
  }

  // --- Event delegation ---
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var action = el.dataset.action;
    if (action === 'select-profile') selectProfile(el.dataset.id);
    else if (action === 'select-senders') selectSendersView();
    else if (action === 'select-sender') selectSender(el.dataset.email);
    else if (action === 'select-session') selectSession(el.dataset.id, el.dataset.peer);
    else if (action === 'back-to-senders') selectSendersView();
    else if (action === 'select-dispatch') selectDispatchView();
    else if (action === 'retry-failed') doRetry(false);
    else if (action === 'retry-all') doRetry(true);
    else if (action === 'select-usage') selectUsageView();
    else if (action === 'select-activity') selectActivityView();
    else if (action === 'select-config') selectConfigView();
    else if (action === 'cfg-tab') cfgSwitchTab(el.dataset.tab);
    else if (action === 'cfg-run-doctor') renderCfgHealth();
    else if (action === 'cfg-poll-now') cfgPollNow(el.dataset.profile);
    else if (action === 'cfg-rebuild-index') cfgRebuildIndex(el.dataset.profile);
    else if (action === 'cfg-test-conn') cfgShowTestModal(el.dataset.profile);
    else if (action === 'cfg-view-log') { cfgLogProfile = el.dataset.profile; cfgSwitchTab('logs'); }
    else if (action === 'cfg-save-polling') cfgSavePolling(el.dataset.profile);
    else if (action === 'cfg-save-binding') cfgSaveBinding(el.dataset.profile);
    else if (action === 'cfg-toggle-hook') cfgToggleHook(el.dataset.profile);
    else if (action === 'cfg-save-hook') cfgSaveHook(el.dataset.profile);
    else if (action === 'cfg-svc-install') { cfgPost('/api/config/services/install', {}).then(function(r) { cfgShowFeedback('svc-feedback', r.ok !== false ? 'Installed' : (r.error || 'Failed'), r.ok !== false); renderCfgServices(); }).catch(function() { cfgShowFeedback('svc-feedback', 'Failed', false); }); }
    else if (action === 'cfg-svc-uninstall') { cfgPost('/api/config/services/uninstall', {}).then(function(r) { cfgShowFeedback('svc-feedback', r.ok !== false ? 'Uninstalled' : (r.error || 'Failed'), r.ok !== false); renderCfgServices(); }).catch(function() { cfgShowFeedback('svc-feedback', 'Failed', false); }); }
    else if (action === 'cfg-refresh-logs') cfgLoadLogs();
    else if (action === 'cfg-test-send') cfgSendTest();
    else if (action === 'cfg-test-cancel') { var m = document.getElementById('test-modal'); if (m) m.remove(); }
    else if (action === 'cfg-show-create') cfgShowCreateForm();
    else if (action === 'cfg-create-submit') cfgCreateSubmit();
    else if (action === 'cfg-edit-env') cfgEditEnv(el.dataset.profile);
    else if (action === 'cfg-env-save') cfgSaveEnv(el.dataset.profile);
    else if (action === 'cfg-env-cancel') { var m = document.getElementById('env-modal'); if (m) m.remove(); }
    else if (action === 'back-to-sidebar') showPanel('panel-sidebar');
    else if (action === 'back-to-mid') { showPanel(document.getElementById('app').classList.contains('fullwidth') ? 'panel-sidebar' : 'panel-mid'); }
  });

  init();
  updateDispatchBadge();
  setInterval(updateDispatchBadge, 10000);
  if (isMobile) showPanel('panel-sidebar');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  }
})();
</script>
</body>
</html>`;
