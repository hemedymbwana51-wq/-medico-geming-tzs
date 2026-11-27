// MEDICO app.js v9 - magemu, usajili, profile, chat (kamili)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  increment,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  firebaseConfig,
  ADMIN_UID,
  PAYMENT_NUMBER
} from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Hifadhi ya ndani: uthibitisho unahifadhiwa ukiwa offline na kutumwa intaneti ikirudi
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn("Hifadhi ya ndani haipatikani, inatumia mtandao tu:", e);
  db = getFirestore(app);
}


// Taarifa za malipo zinazoonyeshwa kwa mteja. BADILISHA hapa.
const PAY_INFO = {
  network: "Tigo Pesa",
  number: PAYMENT_NUMBER,
  name: "JINA LA MPOKEAJI"
};

const $ = s => document.querySelector(s);

// Ada ya kuweka duka (TZS). Badilisha hapa.
const STORE_FEE = 3000;

// Direct Link ya Adsterra: tangazo linalofunguka kabla ya upakuaji. Acha tupu kama hutaki.
const AD_DIRECT_URL = "";

// ---- Token na balance: badilisha hapa. Kanuni za Firestore (firestore.rules) lazima zilingane. ----
const TOKEN_SIGNUP = 10;    // token za kujisajili
const TOKEN_DAILY = 2;      // token za kudai kila siku (mara moja kwa siku)
const TOKEN_PER_VIEW = 1;   // token ya mtazamaji kwa kila game analoliangalia
const ADMIN_PER_VIEW = 1000;   // TZS kwa kila mtu anayeangalia game (mara moja kwa game)
const ADMIN_PER_SIGNUP = 1000; // TZS kwa kila mtu anayejisajili
const ADMIN_PER_DAY = 1000;    // TZS kwa kila mtu aliyesajiliwa anayeingia kwenye website kila siku


let profileUnsub = null;
let walletUnsub = null;
let walletBal = 0;
let walletView = 0;
let walletDl = 0;
let walletSignup = 0;
let walletDaily = 0;
let chatMode = "group";
let privateUnsub = null;

let currentUser = null;
let profile = null;
let games = [];
let activeFilter = "all";
let gamesUnsub = null;
let userChatUnsub = null;
let adminUnsubs = [];
let threadUnsub = null;

/* ---------- Misaada ---------- */

function toast(message) {
  const t = $("#toast");
  if (!t) {
    alert(message);
    return;
  }
  t.textContent = message;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3000);
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function money(n) {
  return "TZS " + Number(n || 0).toLocaleString();
}

function isAdmin() {
  return !!currentUser && currentUser.uid === ADMIN_UID && !currentUser.isAnonymous;
}

function isRegistered() {
  return !!currentUser && !currentUser.isAnonymous;
}

function authErrorText(e) {
  const code = e && e.code ? e.code : "";
  const map = {
    "auth/email-already-in-use": "Email hii tayari imesajiliwa. Bonyeza INGIA badala yake.",
    "auth/invalid-email": "Email haionekani sahihi. Mfano: jina@gmail.com.",
    "auth/weak-password": "Nenosiri ni dhaifu. Tumia herufi 6 au zaidi.",
    "auth/invalid-credential": "Email au nenosiri si sahihi. Angalia tena.",
    "auth/wrong-password": "Nenosiri si sahihi. Angalia tena.",
    "auth/user-not-found": "Akaunti hii haipo. Jisajili kwanza.",
    "auth/too-many-requests": "Umejaribu mara nyingi. Subiri dakika chache kisha ujaribu tena.",
    "auth/network-request-failed": "Hakuna mtandao. Angalia intaneti yako kisha ujaribu tena.",
    "auth/operation-not-allowed": "Usajili wa email haujawashwa kwenye Firebase (Authentication → Sign-in method)."
  };
  return map[code] || ("Kuna tatizo: " + ((e && e.message) || "jaribu tena."));
}

function fmtDate(ts) {
  try {
    const d = ts && ts.toDate ? ts.toDate() : null;
    return d
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
  } catch (e) {
    return "";
  }
}

/* ---------- Mitindo ya chat na profile (inaingizwa na JS, inafanya kazi kwenye kurasa zote) ---------- */

function injectStyles() {
  if (!$("#isAdminPage")) return; // website inatumia index.html tu
  if (document.getElementById("medico-extra-style")) return;
  const s = document.createElement("style");
  s.id = "medico-extra-style";
  s.textContent = `
    .msgs{height:55vh;max-height:430px;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px;background:rgba(7,2,26,.6);border:1px solid rgba(232,128,111,.25);border-radius:12px}
    .bub{max-width:80%;padding:8px 11px;border-radius:12px;font-size:.84rem;line-height:1.4;word-wrap:break-word;white-space:pre-wrap;align-self:flex-start;background:#1a0f40;color:#e9e6ff;border:1px solid rgba(154,147,201,.25)}
    .bub.me{align-self:flex-end;background:linear-gradient(90deg,#e8806f,#d9705f);color:#07021a;border:0}
    .bub small{display:block;font-size:.6rem;letter-spacing:.08em;opacity:.85;margin-bottom:2px;font-weight:800}
    .chatform{display:flex;gap:8px;margin-top:10px;align-items:center}
    .chatform input{flex:1;margin:0!important}
    .chatform .primary{width:auto;margin:0;padding:10px 14px;white-space:nowrap}
    .threads{display:flex;flex-direction:column;gap:8px;margin:8px 0 12px;max-height:260px;overflow:auto}
    .thread-item{position:relative;text-align:left;background:rgba(255,255,255,.04);color:#e9e6ff;border:1px solid rgba(232,128,111,.25);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:.8rem}
    .thread-item strong{display:block;font-size:.88rem;color:#fff}
    .thread-item small{display:block;color:#9a93c9;font-size:.72rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:40px}
    .thread-item:hover{border-color:#f0a08a}
    .unread{position:absolute;right:10px;top:10px;background:#f0a08a;color:#fff;border-radius:99px;padding:2px 7px;font-size:.66rem;font-weight:900}
    .pcard{background:rgba(20,10,55,.78);border:1px solid rgba(232,128,111,.25);border-radius:14px;padding:18px;max-width:520px;margin:0 auto}
    .pcard label{display:block;font-size:.72rem;color:#e8806f;margin-top:10px}
    .pcard input{width:100%;padding:10px;margin:5px 0 8px;background:#08031d;color:#e9e6ff;border:1px solid rgba(232,128,111,.3);border-radius:8px;font-size:.85rem}
    .muted{color:#9a93c9;font-size:.8rem}
    .loginmsg{margin-top:10px;font-size:.8rem;color:#ffb3d9;min-height:1em}
    .paybox{padding:12px;margin:12px 0;background:rgba(232,128,111,.08);border:1px dashed #e8806f;border-radius:12px;font-size:.84rem;line-height:1.5}
    .paytable{background:rgba(7,2,26,.6);border:1px solid rgba(232,128,111,.3);border-radius:14px;padding:6px 14px;margin:12px 0}
    .payrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:.86rem}
    .payrow:last-child{border-bottom:0}
    .payrow span{color:#9a93c9}
    .payrow b{color:#ff8aa8;font-family:ui-monospace,Menlo,Consolas,monospace;text-align:right}
    .contactrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0;padding:12px;border:1px solid rgba(232,128,111,.3);border-radius:14px;background:rgba(7,2,26,.5)}
    .contactrow>span{flex:1 1 100%;color:#9a93c9;font-size:.76rem}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:99px;border:1px solid #f0a08a;color:#ff8aa8;font-weight:800;font-size:.76rem;text-decoration:none;background:none}
    .pill.wa{border-color:#25d366;color:#7ef0a6}
    .btnrow{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:6px}
    .btnrow button{padding:13px;border-radius:12px;font-weight:900;font-size:.9rem;border:0}
    .btnrow .secondary{background:#1a2a41;color:#e9e6ff;border:1px solid rgba(154,147,201,.4)}
    .btnrow .primary{background:linear-gradient(90deg,#e8806f,#d9705f);color:#07021a}
    .btnrow .primary:disabled{opacity:.6}
    .shots{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
    .shots img{width:140px;max-width:100%;border-radius:10px;border:1px solid rgba(232,128,111,.3)}
    .modal-card .primary{width:100%}
    .modal-card label{display:block;margin-top:12px;color:#e8806f;font-size:.76rem;font-weight:700}
    .modal-card input[type=file]{padding:8px;font-size:.8rem}
  `;
  document.head.appendChild(s);
}

/* ---------- Kuingia / kutoka / akaunti ---------- */

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user && !$("#isAdminPage")) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error("signInAnonymously:", e.code, e.message);
    }
  }

  await loadGames();
  await loadProfile();

  if (isAdmin() && $("#isAdminPage")) {
    adminDashboard();
  }
});

async function loadProfile() {
  if (profileUnsub) {
    profileUnsub();
    profileUnsub = null;
  }
  profile = null;

  if (isRegistered()) {
    profileUnsub = onSnapshot(doc(db, "users", currentUser.uid),
      snap => {
        profile = snap.exists()
          ? snap.data()
          : { name: currentUser.displayName || "", email: currentUser.email || "" };
        renderProfile();
        renderToken();
        checkDailyVisit();
        renderCoin();
        autoDaily();
        renderBell();
      },
      e => console.error("profile:", e)
    );
  }

  if (isAdmin()) startWallet(); else stopWallet();

  if (isRegistered()) startNotifications(); else stopNotifications();
  if (isRegistered()) startHeartbeat(); else stopHeartbeat();

  if (!$("#isAdminPage")) {
    if (isRegistered()) {
      hideWall();
      if (!isAdmin() && window.medicoShowAd) window.medicoShowAd();
    } else {
      showWall();
    }
  }

  renderProfile();
  renderCoin();
  applyRoleNav();
  renderGames();

  if ($("#view-chat") && $("#view-chat").classList.contains("active")) {
    startUserChat();
  }
}



function openAuth(mode = "login") {
  const m = $("#authModal");
  if (!m) return;
  m.classList.remove("hidden");
  renderAuth(mode);
}

function renderAuth(mode) {
  const form = $("#authForm");
  if (!form) return;

  $("#tabLogin").classList.toggle("on", mode === "login");
  $("#tabReg").classList.toggle("on", mode === "register");
  $("#tabLogin").onclick = () => renderAuth("login");
  $("#tabReg").onclick = () => renderAuth("register");

  form.innerHTML = `
    ${mode === "register" ? `
      <label>Jina</label>
      <input id="aName" placeholder="Jina lako">
    ` : ""}
    <label>Email</label>
    <input id="aEmail" type="email" placeholder="mfano@gmail.com" autocomplete="email">
    <label>Nenosiri (angalau herufi 6)</label>
    <input id="aPass" type="password" placeholder="••••••" autocomplete="${mode === "register" ? "new-password" : "current-password"}">
    <button class="primary" id="aGo" type="button">${mode === "register" ? "JISAJILI" : "INGIA"}</button>
    <div id="aMsg" class="loginmsg"></div>
  `;

  $("#aGo").onclick = () => (mode === "register" ? doRegister() : doLogin());
}

async function logout() {
  try {
    await signOut(auth);
    toast("Umetoka.");
    showView("home");
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

/* ---------- Views (Home / Chat / Profile) ---------- */

function showView(name) {
  const cur = document.querySelector(".view.active");
  if (cur && cur.id === "view-chat" && name !== "chat") { stopGroup(); stopPrivate(); }
  if (cur && cur.id === "view-store" && name !== "store") stopStore();

  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === "view-" + name);
  });
  document.querySelectorAll(".bnav [data-view]").forEach(b => {
    b.classList.toggle("on", b.dataset.view === name);
  });

  if (name === "chat") startUserChat();
  if (name === "store") startStore();
  if (name === "profile") renderProfile();
  window.scrollTo(0, 0);
}

function renderProfile() {
  const box = $("#profileBox");
  if (!box) return;

  if (!isRegistered()) {
    box.innerHTML = `
      <div class="pcard2 pguest">
        <div class="pavatar">MD</div>
        <div class="pname">Haujaingia</div>
        <p class="pmuted">Jisajili au ingia ili uone profile yako.</p>
        <button class="pbtn" id="pAuth" type="button">INGIA / JISAJILI</button>
      </div>`;
    $("#pAuth").onclick = () => openAuth("register");
    return;
  }

  const name = (profile && profile.name) || currentUser.displayName || "Mteja";
  const email = currentUser.email || "";
  const tokens = Number((profile && profile.tokens) || 0);
  const streak = Number((profile && profile.streak) || 0);
  const since = profile && profile.createdAt ? fmtMonthYear(profile.createdAt) : "—";
  const initials = (name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("") || "MD").toUpperCase();

  box.innerHTML = `
    <div class="pheader">
      <button class="pback" id="pBack" type="button" aria-label="Rudi">←</button>
      <div><b>Profile Yangu</b><small>Akaunti yako MEDICO GAMING TZS</small></div>
    </div>

    <div class="phero">
      <div class="pavatar">${esc(initials)}</div>
      <div class="pinfo">
        <div class="pname">${esc(name)}</div>
        <div class="pmail">${esc(email)}</div>
        <div class="pmeta">Tanzania</div>
      </div>
    </div>

    <div class="pchips">
      <button class="pchip on" data-jump="pSum" type="button">📊 Muhtasari</button>
      <button class="pchip" data-jump="pAcc" type="button">👤 Akaunti</button>
      <button class="pchip" data-jump="pOmba" type="button">🎮 Omba Game</button>
    </div>

    <div class="pcard2" id="pSum">
      <h3>📊 Takwimu Zangu</h3>
      <div class="pstats">
        <div class="pstat">
          <div class="pn">🪙 ${tokens.toLocaleString()}</div>
          <div class="pl">Tokeni zako</div>
        </div>
        <div class="pstat">
          <div class="pn">🔥 ${streak}</div>
          <div class="pl">Siku mfululizo</div>
          <button class="pmini" id="pDaily" type="button">DAI ZAWADI</button>
        </div>
      </div>
    </div>

    <div class="pcard2" id="pAcc">
      <div class="pcardhead">
        <h3>👤 Akaunti</h3>
        <button class="pedit" id="pSave" type="button">✏️ HIFADHI</button>
      </div>
      <label>Jina</label>
      <input id="pName" value="${esc(name)}">
      <div class="prow"><span>🌍 Taifa</span><b>Tanzania</b></div>
      <div class="prow"><span>✉️ Email</span><b>${esc(email)}</b></div>
      <div class="prow"><span>📅 Mwanachama tangu</span><b>${esc(since)}</b></div>
      <button class="plogout" id="pLogout" type="button">TOKA</button>
    </div>

    <div class="pcard2" id="pOmba">
      <h3>🎮 Omba Game Unayoitaka</h3>
      <p class="pmuted">Tuambie game gani uone ikiwekwa hapa</p>
      <input id="omName" placeholder="Jina la game, mfano: GTA V">
      <button class="pbtn" id="omSend" type="button">TUMA OMBI</button>
    </div>
  `;

  $("#pBack").onclick = () => showView("home");
  $("#pSave").onclick = saveProfileName;
  $("#pDaily").onclick = openDaily;
  $("#pLogout").onclick = logout;
  $("#omSend").onclick = sendGameRequest;
  box.querySelectorAll("[data-jump]").forEach(b => {
    b.onclick = () => {
      box.querySelectorAll(".pchip").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      const target = document.getElementById(b.dataset.jump);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
}

async function saveProfileName() {
  const name = $("#pName").value.trim();
  if (!name) return toast("Weka jina lako.");

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      name,
      email: currentUser.email || "",
      updatedAt: serverTimestamp()
    }, { merge: true });
    profile = { ...(profile || {}), name };
    toast("Jina limehifadhiwa.");
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

/* ---------- Chat: ujumbe ---------- */

function renderMessages(box, msgs, role) {
  if (!box) return;
  box.innerHTML = msgs.length
    ? msgs.map(m => {
        const mine = m.from === role;
        const label = m.from === "admin" ? "Admin" : (m.name || "Mteja");
        return `<div class="bub ${mine ? "me" : ""}"><small>${esc(label)}</small>${esc(m.text)}</div>`;
      }).join("")
    : '<div class="muted">Hakuna ujumbe bado.</div>';
  box.scrollTop = box.scrollHeight;
}

function stopUserChat() {
  if (userChatUnsub) {
    userChatUnsub();
    userChatUnsub = null;
  }
}





/* ---------- Magemu (home) ---------- */

function loadGames() {
  try {
    if (gamesUnsub) gamesUnsub();

    gamesUnsub = onSnapshot(collection(db, "games"), snap => {
      games = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      renderGames();

      if (isAdmin() && $("#adminGameList")) {
        renderAdminGameList();
      }
    }, e => {
      console.error("games snapshot:", e);
      if ($("#gameGrid")) {
        $("#gameGrid").innerHTML = "Imeshindikana kupakia magemu.";
      }
    });
  } catch (e) {
    console.error(e);
  }
}



async function shareGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  const data = {
    title: g.title,
    text: g.title + " - MEDICO GAMING TZS",
    url: location.href.split("#")[0]
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(data.url);
      toast("Link imenakiliwa.");
    }
  } catch (e) {
    /* mtumiaji amefunga dirisha la share */
  }
}

let payUnsubs = [];
let payState = { owned: false, status: null };
let payGameId = null;

function stopPayListeners() {
  payUnsubs.forEach(u => { if (u) u(); });
  payUnsubs = [];
}

function intlPhone(n) {
  return "+255" + String(n).replace(/^0/, "");
}

function showGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;

  stopPayListeners();
  payGameId = g.id;
  markViewed(g.id);
  payState = { owned: false, status: null };
  $("#gameModal").classList.remove("hidden");

  if (!g.paid) {
    $("#gameDetails").innerHTML = `
      <h2>${esc(g.title)}</h2>
      <p>${esc(g.description || "")}</p>
      <div class="paybox">Gemu hili ni bure.</div>
      <button class="primary" id="downloadGame" type="button">PAKUA GEMU</button>`;
    $("#downloadGame").onclick = () => startDownload(g.id);
    return;
  }

  if (!isRegistered()) {
    renderPaidGame(g);
    return;
  }

  // Sikiliza malipo kwa wakati halisi: admin akithibitisha, kitufe cha kupakua kinafunguka papo hapo
  payUnsubs.push(onSnapshot(
    doc(db, "entitlements", `${currentUser.uid}_${g.id}`),
    snap => {
      payState.owned = snap.exists();
      renderPaidGame(g);
    },
    e => console.error("entitlement:", e)
  ));

  payUnsubs.push(onSnapshot(
    query(
      collection(db, "paymentRequests"),
      where("uid", "==", currentUser.uid),
      where("gameId", "==", g.id)
    ),
    snap => {
      const statuses = snap.docs.map(d => d.data().status);
      if (statuses.includes("pending")) payState.status = "pending";
      else if (statuses.includes("rejected")) payState.status = "rejected";
      else payState.status = null;
      renderPaidGame(g);
    },
    e => console.error("requests:", e)
  ));

  renderPaidGame(g);
}

function renderPaidGame(g) {
  const box = $("#gameDetails");
  if (!box) return;

  const head = `<h2>${esc(g.title)}</h2><p>${esc(g.description || "")}</p>`;

  if (!isRegistered()) {
    box.innerHTML = head + `
      <div class="paybox">Jisajili kwanza ili ulipie gemu hili.</div>
      <button class="primary" id="gJoin" type="button">INGIA / JISAJILI</button>`;
    $("#gJoin").onclick = () => openAuth("register");
    return;
  }

  if (payState.owned) {
    box.innerHTML = head + `
      <div class="paybox">Malipo yako yamethibitishwa. Unaweza kupakua gemu.</div>
      <button class="primary" id="downloadGame" type="button">PAKUA GEMU</button>`;
    $("#downloadGame").onclick = () => startDownload(g.id);
    return;
  }

  if (payState.status === "pending") {
    box.innerHTML = head + `
      <div class="paybox">Ombi lako limepokelewa. Admin anathibitisha malipo. Mara akithibitisha, kitufe cha kupakua kitaonekana hapa hapa bila kufunga ukurasa.</div>`;
    return;
  }

  const notice = payState.status === "rejected"
    ? `<div class="paybox" style="border-color:#e8806f">Ombi lako lilikataliwa. Hakikisha picha ya muamala ni sahihi kisha tuma tena.</div>`
    : "";

  box.innerHTML = head + notice + `
    <div class="paytable">
      <div class="payrow"><span>Mtandao</span><b>${esc(PAY_INFO.network)}</b></div>
      <div class="payrow"><span>Namba</span><b>${esc(PAY_INFO.number)}</b></div>
      <div class="payrow"><span>Jina</span><b>${esc(PAY_INFO.name)}</b></div>
      <div class="payrow"><span>Kiasi</span><b>${money(g.price)}</b></div>
    </div>

    <label>Namba uliyotumia kutuma pesa</label>
    <input id="payPhone" placeholder="07XXXXXXXX" inputmode="tel">

    <label>Picha ya 1 — screenshot ya muamala</label>
    <input id="pay1" type="file" accept="image/*">

    <label>Picha ya 2 — screenshot ya muamala (ya hiari)</label>
    <input id="pay2" type="file" accept="image/*">

    <div class="contactrow">
      <span>Uthibitisho unachukua muda mrefu?</span>
      <a class="pill" href="tel:${esc(intlPhone(PAY_INFO.number))}">📞 Piga Simu</a>
      <a class="pill wa" href="https://wa.me/${esc(intlPhone(PAY_INFO.number).replace("+", ""))}?text=${encodeURIComponent("Habari, nimelipia " + g.title)}" target="_blank" rel="noopener">💬 WhatsApp</a>
    </div>

    <div class="btnrow">
      <button class="secondary" type="button" data-close="gameModal">Funga</button>
      <button class="primary" id="paySend" type="button">NIMELIPA ✓</button>
    </div>`;

  $("#paySend").onclick = () => submitPayment(g);
  box.querySelectorAll("[data-close]").forEach(b => {
    b.onclick = closeGameModal;
  });
}

function closeGameModal() {
  stopPayListeners();
  $("#gameModal").classList.add("hidden");
}

async function submitPayment(g) {
  const phone = $("#payPhone").value.trim();
  const f1 = $("#pay1").files[0];
  const f2 = $("#pay2").files[0];

  if (!/^0\d{9}$/.test(phone)) {
    return toast("Weka namba sahihi ya simu, mfano 07XXXXXXXX.");
  }
  if (!f1) {
    return toast("Pakia angalau picha 1 ya muamala.");
  }
  if (!isRegistered()) {
    return openAuth("register");
  }

  const btn = $("#paySend");
  btn.disabled = true;
  btn.textContent = "INATUMA...";

  try {
    const images = [await compressImage(f1, 800, 0.7)];
    if (f2) images.push(await compressImage(f2, 800, 0.7));

    const total = images.reduce((n, x) => n + x.length, 0);
    if (total > 900000) {
      throw new Error("Picha ni kubwa mno. Tumia screenshot ndogo zaidi.");
    }

    await addDoc(collection(db, "paymentRequests"), {
      uid: currentUser.uid,
      gameId: g.id,
      gameTitle: g.title,
      kind: "game",
      price: g.price,
      payerName: (profile && profile.name) || "Mteja",
      payerPhone: phone,
      images,
      status: "pending",
      createdAt: serverTimestamp()
    });

    toast("Ombi limetumwa. Admin atathibitisha.");
  } catch (e) {
    console.error("payment:", e.code, e.message);
    toast("KOSA: " + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "NIMELIPA ✓";
    }
  }
}

async function download(gameId) {
  const game = games.find(g => g.id === gameId);

  if (!isRegistered()) {
    toast("Jisajili au ingia kwanza ili upakue.");
    openAuth("register");
    return;
  }

  if (!game || !game.driveUrl) {
    return toast("Link ya kupakua haipatikani.");
  }

  window.open(game.driveUrl, "_blank");

  if (isRegistered() && !isAdmin()) {
    try {
      await recordView(game);
      await setDoc(doc(db, "games", gameId, "viewers", currentUser.uid), {
        name: (profile && profile.name) || "Mteja",
        downloaded: true,
        viewed: true,
        at: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("viewer:", e.code, e.message);
    }
  }

  try {
    await updateDoc(doc(db, "games", gameId), { downloads: increment(1) });
  } catch (e) {
    console.error("download count:", e.code, e.message);
  }
}

/* ---------- Maoni ---------- */

let cmUnsub = null;
let cmGameId = null;

function openComments(gameId) {
  const g = games.find(x => x.id === gameId);
  if (!g) return;

  cmGameId = gameId;
  $("#cmTitle").textContent = "Maoni: " + g.title;
  $("#commentsModal").classList.remove("hidden");

  $("#cmSend").onclick = sendComment;
  $("#cmInput").onkeydown = e => { if (e.key === "Enter") sendComment(); };

  if (cmUnsub) cmUnsub();
  cmUnsub = onSnapshot(
    query(collection(db, "comments"), where("gameId", "==", gameId)),
    snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : Date.now();
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : Date.now();
        return ta - tb;
      });
      renderComments(list, gameId);
    },
    e => {
      console.error("comments:", e);
      $("#cmList").innerHTML = '<div class="muted">Imeshindikana kupakia maoni: ' + esc(e.message) + "</div>";
    }
  );
}

function renderComments(list, gameId) {
  const box = $("#cmList");
  if (!box) return;

  box.innerHTML = list.length
    ? list.map(c => {
        const canDelete = isAdmin() || (currentUser && c.uid === currentUser.uid);
        return `
          <div class="cm-item">
            <strong>${esc(c.name || "Mteja")}</strong>
            <small>${esc(fmtDate(c.createdAt))}</small>
            <p>${esc(c.text)}</p>
            ${canDelete ? `<button class="cm-del" data-cmdel="${esc(c.id)}" type="button">Futa</button>` : ""}
          </div>`;
      }).join("")
    : '<div class="muted">Bado hakuna maoni. Kuwa wa kwanza kuandika!</div>';

  box.querySelectorAll("[data-cmdel]").forEach(b => {
    b.onclick = () => deleteComment(b.dataset.cmdel, gameId);
  });
}

async function sendComment() {
  const input = $("#cmInput");
  const text = input.value.trim();
  if (!text) return;

  if (!isRegistered()) {
    $("#commentsModal").classList.add("hidden");
    toast("Jisajili kwanza ili uandike maoni.");
    openAuth("register");
    return;
  }

  if (text.length > 500) {
    return toast("Maoni ni marefu mno (herufi 500 kiwango cha juu).");
  }

  input.value = "";

  try {
    await addDoc(collection(db, "comments"), {
      gameId: cmGameId,
      uid: currentUser.uid,
      name: (profile && profile.name) || "Mteja",
      text,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "games", cmGameId), { commentCount: increment(1) });

  } catch (e) {
    input.value = text;
    toast("Maoni hayakutumwa: " + e.message);
  }
}

async function deleteComment(id, gameId) {
  if (!confirm("Futa maoni haya?")) return;

  try {
    await deleteDoc(doc(db, "comments", id));
    await updateDoc(doc(db, "games", gameId), { commentCount: increment(-1) });
    toast("Maoni yamefutwa.");
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

/* ---------- Admin ---------- */

function stopAdminListeners() {
  adminUnsubs.forEach(u => { if (u) u(); });
  adminUnsubs = [];
  if (threadUnsub) {
    threadUnsub();
    threadUnsub = null;
  }
}

function showAdmin() {
  const modal = $("#adminModal");
  const area = $("#adminArea");

  if (!area) {
    console.error("Kipengele #adminArea hakipo kwenye HTML.");
    return toast("Hitilafu: #adminArea haipo kwenye ukurasa.");
  }

  if (modal) modal.classList.remove("hidden");

  if (isAdmin()) {
    adminDashboard();
    return;
  }

  area.innerHTML = `
    <h2>MEDICO ADMIN LOGIN</h2>
    <p class="muted">Sehemu ya mmiliki pekee.</p>
    <label>Email ya Admin</label>
    <input id="adminEmail" type="email" placeholder="Email">
    <label>Password</label>
    <input id="adminPass" type="password" placeholder="Password">
    <button class="primary" id="adminLogin" type="button">INGIA</button>
    <div id="loginMsg" class="loginmsg"></div>
  `;

  $("#adminLogin").onclick = async () => {
    const email = $("#adminEmail").value.trim();
    const password = $("#adminPass").value;
    const msg = $("#loginMsg");

    if (!email || !password) {
      msg.textContent = "Weka Email na Password.";
      return;
    }

    msg.textContent = "Inaingia...";

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);

      if (result.user.uid !== ADMIN_UID) {
        await signOut(auth);
        msg.textContent = "Hii si akaunti ya Admin. (UID: " + result.user.uid + ")";
        return;
      }

      adminDashboard();

    } catch (e) {
      console.error("admin login:", e.code, e.message);
      msg.textContent = "KOSA: " + authErrorText(e) + " (" + (e.code || "") + ")";
    }
  };
}

function adminDashboard() {
  $("#adminArea").innerHTML = `
    <h2>MEDICO ADMIN PANEL</h2>
    <p class="muted">Usimamizi wa magemu, malipo, mazungumzo na balance.</p>

    <div class="bal-box">
      <h3>📊 TAKWIMU NA MAPATO HALISI</h3>
      <div id="balanceCard">Inapakia...</div>
    </div>

    <div class="tabs">
      <button class="secondary" id="tabGames" type="button">MAGEMU</button>
      <button class="secondary" id="tabUsers" type="button">WATEJA</button>
      <button class="secondary" id="tabNotes" type="button">TAARIFA</button>
      <button class="secondary" id="tabChat" type="button">CHAT</button>
      <button class="secondary" id="tabPayments" type="button">MALIPO</button>
      <button class="secondary" id="adminLogout" type="button">TOKA</button>
    </div>
    <div id="adminContent"></div>
  `;

  $("#tabGames").onclick = adminGames;
  $("#tabChat").onclick = adminChats;
  $("#tabNotes").onclick = adminNotices;
  $("#tabUsers").onclick = adminUsers;
  $("#tabPayments").onclick = adminPayments;

  $("#adminLogout").onclick = async () => {
    stopAdminListeners();
    stopWallet();
    await signOut(auth);
    showAdmin();
  };

  loadStats();
  adminGames();
}

function adminGames() {
  stopAdminListeners();

  $("#adminContent").innerHTML = `
    <h3>ONGEZA GAME AU MOVIE</h3>
    <label>Aina</label>
    <select id="gKind">
      <option value="game">GAME</option>
      <option value="movie">MOVIE</option>
    </select>

    <label>Jina</label>
    <input id="gTitle" placeholder="Jina">

    <label>Jamii (kwa game)</label>
    <select id="gCat">
      <option>PPSSPP</option>
      <option>Android</option>
      <option>PC</option>
    </select>

    <label>Maelezo</label>
    <textarea id="gDesc"></textarea>

    <label>Bei (0 = bure)</label>
    <input id="gPrice" type="number" min="0">

    <label>Picha (chagua kutoka simu)</label>
    <input id="gImageFile" type="file" accept="image/*">
    <img id="gPreview" alt="" style="display:none;max-width:100%;border-radius:8px;margin-bottom:10px">

    <label>AU URL ya picha (hiari)</label>
    <input id="gImage" placeholder="https://...">

    <label>Google Drive Download Link</label>
    <input id="gFile" type="url" placeholder="Bandika link ya Google Drive">

    <button class="primary" id="saveGame" type="button">HIFADHI</button>

    <h3>YALIYOPO</h3>
    <div id="adminGameList"></div>
  `;

  $("#saveGame").onclick = saveGame;

  $("#gImageFile").onchange = async () => {
    const f = $("#gImageFile").files[0];
    const p = $("#gPreview");
    if (!f) { p.style.display = "none"; return; }
    try {
      p.src = await compressImage(f);
      p.style.display = "block";
    } catch (e) {
      toast(e.message);
    }
  };

  renderAdminGameList();
}

function renderAdminGameList() {
  const box = $("#adminGameList");
  if (!box) return;

  box.innerHTML = games.length
    ? games.map(g => `
      <div class="admin-list">
        <strong>${g.kind === "movie" ? "🎬 " : "🎮 "}${esc(g.title)}</strong>
        <small>${g.paid ? money(g.price) : "BURE"} • 👁 ${Number(g.views || 0)} • ⬇ ${Number(g.downloads || 0)}</small>
        <button class="danger" data-delete-game="${esc(g.id)}" type="button">FUTA</button>
      </div>`).join("")
    : '<div class="muted">Hakuna bado.</div>';

  box.querySelectorAll("[data-delete-game]").forEach(button => {
    button.onclick = () => deleteGame(button.dataset.deleteGame);
  });
}

function compressImage(file, maxW = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Picha haisomeki. Jaribu picha nyingine."));
    };
    img.src = url;
  });
}

async function deleteGame(id) {
  try {
    if (!isAdmin()) {
      alert("Huruhusiwi kufuta gemu. Ingia kama Admin.");
      return;
    }

    const game = games.find(g => g.id === id);
    if (!game) {
      alert("Gemu halijapatikana.");
      return;
    }

    if (!confirm("Una uhakika unataka kufuta " + game.title + "?")) return;

    await deleteDoc(doc(db, "games", id));
    toast("Gemu limefutwa.");

  } catch (error) {
    console.error("DELETE ERROR:", error);
    alert("IMESHINDIKANA KUFUTA GEMU:\n" + (error.code || "") + "\n" + error.message);
  }
}

async function saveGame() {
  const title = $("#gTitle").value.trim();
  const driveUrl = $("#gFile").value.trim();
  const price = Number($("#gPrice").value || 0);
  const kind = $("#gKind").value === "movie" ? "movie" : "game";

  if (!title || !driveUrl) {
    return toast("Weka jina na Google Drive link.");
  }

  if (!isAdmin()) {
    return toast("Hujaingia kama Admin. Ingia tena kwa Email na Password.");
  }

  try {
    const id = crypto.randomUUID();

    let imageUrl = $("#gImage").value.trim();
    const imgFile = $("#gImageFile") && $("#gImageFile").files[0];
    if (imgFile) {
      imageUrl = await compressImage(imgFile);
    }
    if (imageUrl.length > 700000) {
      return toast("Picha ni kubwa mno. Chagua ndogo zaidi.");
    }

    await setDoc(doc(db, "games", id), {
      title,
      kind,
      category: $("#gCat").value,
      description: $("#gDesc").value.trim(),
      price,
      paid: price > 0,
      imageUrl,
      driveUrl,
      views: 0,
      downloads: 0,
      commentCount: 0,
      createdAt: serverTimestamp()
    });

    await addDoc(collection(db, "notifications"), {
      title: kind === "movie" ? "Movie mpya imepostiwa" : "Game mpya imepostiwa",
      body: title,
      kind: "game",
      createdAt: serverTimestamp()
    });

    toast("Imehifadhiwa.");
    adminGames();
  } catch (e) {
    console.error("saveGame error:", e.code, e.message);
    toast("KOSA: " + (e.code || "") + " " + e.message);
  }
}

/* ---------- Admin: chat ---------- */

function adminChats() {
  stopAdminListeners();

  $("#adminContent").innerHTML = `
    <h3>MAZUNGUMZO YA WATEJA</h3>
    <div id="threadList" class="threads"></div>
    <div id="threadBox"></div>
  `;

  const unsub = onSnapshot(
    query(collection(db, "chats"), orderBy("lastAt", "desc")),
    snap => {
      const list = $("#threadList");
      if (!list) return;

      list.innerHTML = snap.docs.length
        ? snap.docs.map(d => {
            const c = d.data();
            const name = c.name || "Mteja";
            return `
              <button class="thread-item" data-uid="${esc(d.id)}" data-name="${esc(name)}" type="button">
                <strong>${esc(name)}</strong>
                <small>${esc(c.email || "")}</small>
                <small>${esc(c.lastText || "")}</small>
                ${c.unreadAdmin ? `<span class="unread">${c.unreadAdmin}</span>` : ""}
              </button>`;
          }).join("")
        : '<div class="muted">Hakuna mazungumzo bado.</div>';

      list.querySelectorAll("[data-uid]").forEach(b => {
        b.onclick = () => openAdminThread(b.dataset.uid, b.dataset.name);
      });
    },
    e => {
      console.error("chats list:", e);
      const list = $("#threadList");
      if (list) list.innerHTML = "Imeshindikana kupakia mazungumzo: " + esc(e.message);
    }
  );

  adminUnsubs.push(unsub);
}

function openAdminThread(uid, name) {
  if (threadUnsub) {
    threadUnsub();
    threadUnsub = null;
  }

  $("#threadBox").innerHTML = `
    <h3>MAZUNGUMZO NA ${esc(name)}</h3>
    <div id="chatMsgs" class="msgs"></div>
    <div class="chatform">
      <input id="replyInput" placeholder="Jibu ujumbe...">
      <button class="primary" id="replySend" type="button">TUMA</button>
    </div>
  `;

  setDoc(doc(db, "chats", uid), { unreadAdmin: 0 }, { merge: true })
    .catch(e => console.error("mark read:", e));

  threadUnsub = onSnapshot(
    query(collection(db, "chats", uid, "messages"), orderBy("createdAt", "asc")),
    snap => {
      renderMessages($("#chatMsgs"), snap.docs.map(d => d.data()), "admin");
    },
    e => toast("Ujumbe haukupakiwa: " + e.message)
  );

  $("#replySend").onclick = () => sendAdminReply(uid);
  $("#replyInput").onkeydown = e => { if (e.key === "Enter") sendAdminReply(uid); };
}

async function sendAdminReply(uid) {
  const input = $("#replyInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";

  try {
    await addDoc(collection(db, "chats", uid, "messages"), {
      uid,
      from: "admin",
      text,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "chats", uid), {
      lastText: text,
      lastAt: serverTimestamp(),
      unreadAdmin: 0
    }, { merge: true });

  } catch (e) {
    input.value = text;
    toast("Jibu halikutumwa: " + e.message);
  }
}

/* ---------- Admin: malipo ---------- */

async function adminPayments() {
  stopAdminListeners();
  $("#adminContent").innerHTML = "<h3>MAOMBI YA MALIPO</h3>Inapakia...";

  try {
    const snap = await getDocs(query(
      collection(db, "paymentRequests"),
      where("status", "==", "pending")
    ));

    const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    $("#adminContent").innerHTML =
      "<h3>MAOMBI YA MALIPO</h3>" +
      (reqs.length ? reqs.map(r => `
        <div class="admin-list">
          <strong>${r.kind === "store" ? "🛒 DUKA — " : ""}${esc(r.gameTitle)} — ${money(r.price)}</strong>
          <small>Mteja: ${esc(r.payerName)} • Simu: ${esc(r.payerPhone)}</small>
          <div class="shots">
            ${(r.images || []).map(src => `<img src="${src}" alt="Picha ya muamala">`).join("")}
          </div>
          <button class="primary" data-approve="${esc(r.id)}" type="button">THIBITISHA</button>
          <button class="danger" data-reject="${esc(r.id)}" type="button">KATAA</button>
        </div>
      `).join("") : '<div class="muted">Hakuna maombi yanayosubiri.</div>');

    document.querySelectorAll("[data-approve]").forEach(b => {
      b.onclick = () => reviewPayment(b.dataset.approve, true);
    });

    document.querySelectorAll("[data-reject]").forEach(b => {
      b.onclick = () => reviewPayment(b.dataset.reject, false);
    });

  } catch (e) {
    $("#adminContent").innerHTML = "Imeshindikana kusoma malipo: " + esc(e.message);
  }
}

async function reviewPayment(id, approve) {
  try {
    const r = await getDoc(doc(db, "paymentRequests", id));
    if (!r.exists()) return;

    const data = r.data();

    await updateDoc(doc(db, "paymentRequests", id), {
      status: approve ? "approved" : "rejected",
      reviewedAt: serverTimestamp()
    });

    if (approve) {
      if (data.kind === "store") {
        await setDoc(doc(db, "sellers", data.uid), {
          name: data.payerName || "Mteja",
          active: true,
          approvedAt: serverTimestamp()
        });
      } else {
        await setDoc(doc(db, "entitlements", `${data.uid}_${data.gameId}`), {
          uid: data.uid,
          gameId: data.gameId,
          approvedAt: serverTimestamp()
        });
      }
    }

    toast(approve ? "MALIPO YAMETHIBITISHWA" : "OMBI LIMEKATALIWA");
    adminPayments();

  } catch (e) {
    toast(e.message);
  }
}


/* ================= v12: carousel, token, jumuiya, duka, movie, watazamaji ================= */

let slideIdx = 0;
let slideTimer = null;
let groupUnsub = null;
let vwUnsub = null;
let storeUnsubs = [];
let sellerState = { active: false, pending: false, rejected: false };
let products = [];

function tsOf(g) {
  return g && g.createdAt && g.createdAt.toMillis ? g.createdAt.toMillis() : 0;
}

function injectStyles2() {
  if (!$("#isAdminPage")) return; // website inatumia index.html tu
  if (document.getElementById("medico-v12-style")) return;
  const st = document.createElement("style");
  st.id = "medico-v12-style";
  st.textContent = `
    .bub.adm{border:1px solid #ffd54a;background:rgba(255,213,74,.10);color:#fff7d6}
    .bub.adm small{color:#ffd54a}
    .wa-btn{display:inline-block;margin-top:10px;background:#25d366;color:#fff;padding:9px 12px;border-radius:10px;font-weight:800;font-size:.8rem;text-decoration:none}
    .vw-row{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);font-size:.86rem}
    .pcard textarea{width:100%;padding:10px;margin:6px 0 10px;background:rgba(10,5,35,.85);color:#e9e6ff;border:1px solid rgba(232,128,111,.3);border-radius:10px;font-size:.88rem}
    .pcard h3{font-size:1rem}
    .bal-box{background:rgba(7,2,26,.6);border:1px solid rgba(255,213,74,.45);border-radius:14px;padding:14px 16px;margin:12px 0;box-shadow:0 0 16px rgba(255,213,74,.12)}
    .bal-box h3{color:#ffd54a;font-size:.85rem;letter-spacing:.06em;margin:0 0 6px}
    .bal-total{font-size:1.7rem;font-weight:900;color:#ffd54a;margin:4px 0 10px}
    .bal-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:.86rem}
    .bal-row:last-child{border-bottom:0}
    .bal-row b{color:#fff}
  `;
  document.head.appendChild(st);
}

/* ---------- Kadi za magemu/movie ---------- */

function cardHTML(g) {
  return `
    <article class="game-card" data-gid="${esc(g.id)}">
      <div class="cover-wrap card-open" data-game="${esc(g.id)}">
        <img class="cover" loading="lazy" alt="${esc(g.title)}"
          src="${esc(g.imageUrl || "https://placehold.co/640x360/20324a/ffffff?text=MEDICO+GAMING")}">
        <span class="badge ${g.paid ? "paid" : ""}">${g.paid ? money(g.price) : "BURE"}</span>
      </div>
      <div class="game-info">
        <h3 class="card-open" data-game="${esc(g.id)}">${esc(g.title)}</h3>
        ${fmtDate(g.createdAt) ? `<small class="date">${fmtDate(g.createdAt)}</small>` : ""}
        <p>${esc(g.description || "Pakua na ufurahie.")}</p>
        <div class="chips"><span class="chip">${esc(g.category || "")}</span></div>
        <div class="card-actions">
          <button class="dl-pill" data-dl="${esc(g.id)}" type="button">⬇ ${Number(g.downloads || 0)}</button>
          <button class="maoni-btn" data-comments="${esc(g.id)}" type="button">💬 Maoni (${Number(g.commentCount || 0)})</button>
          <button class="share-game" data-share="${esc(g.id)}" type="button">Share</button>
        </div>
      </div>
    </article>`;
}

function bindCards() {
  document.querySelectorAll("[data-game]").forEach(b => { b.onclick = () => showGame(b.dataset.game); });
  document.querySelectorAll("[data-share]").forEach(b => { b.onclick = () => shareGame(b.dataset.share); });
  document.querySelectorAll("[data-comments]").forEach(b => { b.onclick = () => openComments(b.dataset.comments); });
  document.querySelectorAll("[data-dl]").forEach(b => { b.onclick = () => openViewers(b.dataset.dl, true); });
}

function renderGames() {
  renderCarousel();
  renderToken();
  if (!$("#search")) return;

  const term = $("#search").value.toLowerCase();
  const textOk = g => (`${g.title} ${g.description} ${g.category}`).toLowerCase().includes(term);
  const catOk = g =>
    activeFilter === "all" ||
    g.category === activeFilter ||
    (Array.isArray(g.tags) && g.tags.includes(activeFilter));

  // Games za bure: zinaonekana kwenye Zote na kwenye kategoria zote.
  // Games za kulipia: zinaonekana kwenye sehemu ya LIPIA pekee.
  const homeList = games.filter(g => {
    if (g.kind === "movie" || !textOk(g)) return false;
    if (activeFilter === "LIPIA") return !!g.paid;
    return !g.paid && catOk(g);
  });

  const movieList = games.filter(g => g.kind === "movie" && textOk(g) && catOk(g));

  if ($("#gameGrid")) {
    $("#gameGrid").innerHTML = homeList.length
      ? homeList.map(cardHTML).join("")
      : '<div class="empty">Hakuna gemu hapa bado.</div>';
  }
  if ($("#movieGrid")) {
    $("#movieGrid").innerHTML = movieList.length
      ? movieList.map(cardHTML).join("")
      : '<div class="empty">Hakuna movie bado.</div>';
  }
  bindCards();
  observeCards();
}

/* ---------- Carousel ---------- */

function showSlide() {
  const sl = document.querySelectorAll("#carousel .slide");
  if (!sl.length) return;
  slideIdx = (slideIdx + sl.length) % sl.length;
  sl.forEach((el, i) => el.classList.toggle("on", i === slideIdx));
  document.querySelectorAll("#carousel .dot").forEach((d, i) => d.classList.toggle("on", i === slideIdx));

  const active = sl[slideIdx];
  if (active && active.dataset.slideGid) markViewed(active.dataset.slideGid);
}

function moveSlide(step) {
  slideIdx += step;
  showSlide();
}

function renderCarousel() {
  const box = $("#carousel");
  if (!box) return;

  const top = games.filter(g => g.paid && g.imageUrl).sort((a, b) => tsOf(b) - tsOf(a)).slice(0, 5);
  if (!top.length) {
    box.innerHTML = '<div class="empty">Hakuna gemu bado.</div>';
    return;
  }

  box.innerHTML = top.map(g => `
    <div class="slide" data-slide-gid="${esc(g.id)}">
      <img src="${esc(g.imageUrl)}" alt="${esc(g.title)}">
      <div class="slide-info">
        <span class="trend">🔥 Trending</span>
        <h3>${esc(g.title)}</h3>
        <button class="slide-btn" data-game="${esc(g.id)}" type="button">LIPIA ${money(g.price)}</button>
      </div>
    </div>`).join("") + `
    <button class="arrow l" type="button" aria-label="Nyuma">‹</button>
    <button class="arrow r" type="button" aria-label="Mbele">›</button>
    <div class="dots">${top.map((_, i) => `<span class="dot" data-dot="${i}"></span>`).join("")}</div>`;

  box.querySelector(".arrow.l").onclick = () => moveSlide(-1);
  box.querySelector(".arrow.r").onclick = () => moveSlide(1);
  box.querySelectorAll("[data-dot]").forEach(d => {
    d.onclick = () => { slideIdx = Number(d.dataset.dot); showSlide(); };
  });
  box.querySelectorAll("[data-game]").forEach(b => { b.onclick = () => showGame(b.dataset.game); });

  showSlide();
  if (!slideTimer) slideTimer = setInterval(() => moveSlide(1), 4000);
}

/* ---------- Token ya admin (kila mtazamo wa mtumiaji aliyesajiliwa = token 1) ---------- */

function renderToken() {
  const bar = $("#tokenBar");
  if (bar) bar.classList.add("hidden");
}

/* ---------- Mionekano na watazamaji ---------- */

async function recordView(g) {
  if (!isRegistered() || isAdmin()) return;

  try {
    const ref = doc(db, "games", g.id, "viewers", currentUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().viewed) return;

    await setDoc(ref, {
      name: (profile && profile.name) || "Mteja",
      viewed: true,
      downloaded: snap.exists() ? !!snap.data().downloaded : false,
      at: serverTimestamp()
    }, { merge: true });

    await updateDoc(doc(db, "games", g.id), { views: increment(1) });

    await setDoc(doc(db, "users", currentUser.uid),
      { tokens: increment(TOKEN_PER_VIEW) }, { merge: true });

  } catch (e) {
    console.error("view:", e.code, e.message);
  }
}

function openViewers(gameId, onlyDl = false) {
  const g = games.find(x => x.id === gameId);
  if (!g) return;

  $("#vwTitle").textContent = (onlyDl ? "Waliopakua: " : "Watazamaji: ") + g.title;
  $("#viewersModal").classList.remove("hidden");

  if (vwUnsub) vwUnsub();
  vwUnsub = onSnapshot(collection(db, "games", gameId, "viewers"), snap => {
    const list = snap.docs.map(d => d.data());
    const watched = list.filter(x => x.viewed);
    const dl = list.filter(x => x.downloaded);
    const rows = arr => arr.length
      ? arr.map(x => `<div class="vw-row">${esc(x.name || "Mteja")}</div>`).join("")
      : '<div class="muted">Bado hakuna.</div>';

    $("#vwBody").innerHTML = onlyDl
      ? `<h3>⬇ Waliopakua (${dl.length})</h3>${rows(dl)}`
      : `<h3>👁 Waliotazama (${watched.length})</h3>${rows(watched)}<h3>⬇ Waliopakua (${dl.length})</h3>${rows(dl)}`;
  }, e => {
    $("#vwBody").innerHTML = '<div class="muted">' + esc(e.message) + "</div>";
  });
}

/* ---------- Jumuiya (chat ya kikundi) ---------- */

function stopGroup() {
  if (groupUnsub) {
    groupUnsub();
    groupUnsub = null;
  }
}

function renderGroup(box, msgs) {
  box.innerHTML = msgs.length
    ? msgs.map(m => {
        const mine = !!currentUser && m.uid === currentUser.uid;
        const isAd = m.from === "admin";
        return `<div class="bub ${mine ? "me" : ""} ${isAd ? "adm" : ""}"><small>${isAd ? "👑 Admin" : esc(m.name || "Mteja")}</small>${esc(m.text)}</div>`;
      }).join("")
    : '<div class="muted">Hakuna ujumbe bado. Anza mazungumzo!</div>';
  box.scrollTop = box.scrollHeight;
}

function stopPrivate() {
  if (privateUnsub) {
    privateUnsub();
    privateUnsub = null;
  }
}

function setChatMode(mode) {
  chatMode = mode;
  document.querySelectorAll("[data-chat]").forEach(b => {
    b.classList.toggle("on", b.dataset.chat === mode);
  });
  const inp = $("#chatInput");
  if (inp) {
    inp.placeholder = mode === "group" ? "Andika kwenye jumuiya..." : "Andika ujumbe kwa Admin...";
  }
  startUserChat();
}

function startUserChat() {
  stopGroup();
  stopPrivate();

  const box = $("#chatMsgs");
  if (!box) return;

  if (!isRegistered()) {
    box.innerHTML = '<div class="muted">Jisajili au ingia ili kuchati.</div>';
    return;
  }

  if (chatMode === "admin") {
    privateUnsub = onSnapshot(
      query(collection(db, "chats", currentUser.uid, "messages"), orderBy("createdAt", "asc")),
      snap => {
        renderMessages($("#chatMsgs"), snap.docs.map(d => d.data()), "user");
      },
      e => {
        box.innerHTML = '<div class="muted">Imeshindikana kupakia: ' + esc(e.message) + "</div>";
      }
    );
    return;
  }

  groupUnsub = onSnapshot(
    query(collection(db, "groupMessages"), orderBy("createdAt", "asc")),
    snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(-150);
      renderGroup($("#chatMsgs"), msgs);
    },
    e => {
      box.innerHTML = '<div class="muted">Imeshindikana kupakia: ' + esc(e.message) + "</div>";
    }
  );
}

async function sendUserMessage() {
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;

  if (!isRegistered()) {
    openAuth("register");
    return;
  }
  if (text.length > 500) {
    return toast("Ujumbe ni mrefu (herufi 500 kiwango cha juu).");
  }

  const admin = isAdmin();
  if (admin && chatMode === "admin") {
    return toast("Admin anajibu mazungumzo binafsi kwenye ukurasa wa admin.");
  }

  input.value = "";

  try {
    if (chatMode === "admin") {
      const uid = currentUser.uid;
      const name = (profile && profile.name) || "Mteja";

      await addDoc(collection(db, "chats", uid, "messages"), {
        uid,
        from: "user",
        text,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, "chats", uid), {
        uid,
        name,
        email: currentUser.email || "",
        lastText: text,
        lastAt: serverTimestamp(),
        unreadAdmin: increment(1)
      }, { merge: true });
      return;
    }

    await addDoc(collection(db, "groupMessages"), {
      uid: currentUser.uid,
      name: admin ? "Admin" : ((profile && profile.name) || "Mteja"),
      from: admin ? "admin" : "user",
      text,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    input.value = text;
    toast("Ujumbe haukutumwa: " + e.message);
  }
}

/* ---------- Duka ---------- */

function stopStore() {
  storeUnsubs.forEach(u => { if (u) u(); });
  storeUnsubs = [];
}

function startStore() {
  stopStore();

  storeUnsubs.push(onSnapshot(
    query(collection(db, "products"), where("status", "==", "active")),
    snap => {
      products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderProducts();
    },
    e => console.error("products:", e)
  ));

  if (isRegistered()) {
    storeUnsubs.push(onSnapshot(doc(db, "sellers", currentUser.uid),
      snap => {
        sellerState.active = snap.exists() && snap.data().active === true;
        renderSellBox();
      },
      e => console.error("seller:", e)
    ));

    storeUnsubs.push(onSnapshot(
      query(collection(db, "paymentRequests"),
        where("uid", "==", currentUser.uid),
        where("kind", "==", "store")),
      snap => {
        const st = snap.docs.map(d => d.data().status);
        sellerState.pending = st.includes("pending");
        sellerState.rejected = !sellerState.pending && st.includes("rejected");
        renderSellBox();
      },
      e => console.error("store req:", e)
    ));
  }

  renderProducts();
  renderSellBox();
}

function renderProducts() {
  const box = $("#productGrid");
  if (!box) return;

  box.innerHTML = products.length
    ? products.map(p => {
        const wa = p.phone
          ? `https://wa.me/255${String(p.phone).replace(/^0/, "")}?text=${encodeURIComponent("Habari, nataka " + p.title)}`
          : "";
        return `
          <article class="game-card">
            <div class="cover-wrap">
              ${p.images && p.images[0] ? `<img class="cover" alt="${esc(p.title)}" src="${p.images[0]}">` : ""}
              <span class="badge paid">${money(p.price)}</span>
            </div>
            <div class="game-info">
              <h3>${esc(p.title)}</h3>
              <small class="date">Muuzaji: ${esc(p.sellerName || "")}</small>
              <p>${esc(p.description || "")}</p>
              ${wa ? `<a class="wa-btn" href="${wa}" target="_blank" rel="noopener">💬 WASILIANA</a>` : ""}
            </div>
          </article>`;
      }).join("")
    : '<div class="empty">Hakuna bidhaa bado.</div>';
}

function renderSellBox() {
  const box = $("#sellBox");
  if (!box) return;

  if (!isRegistered()) {
    box.innerHTML = `
      <div class="pcard">
        <p class="muted">Jisajili ili kuuza bidhaa yako kwenye duka.</p>
        <button class="primary" id="sbAuth" type="button">INGIA / JISAJILI</button>
      </div>`;
    $("#sbAuth").onclick = () => openAuth("register");
    return;
  }

  if (isAdmin()) {
    box.innerHTML = '<div class="pcard"><p class="muted">Wewe ni Admin. Bidhaa zinasimamiwa kwenye ukurasa wa admin.</p></div>';
    return;
  }

  if (sellerState.active) {
    box.innerHTML = `
      <div class="pcard">
        <h3>UUZA BIDHAA YAKO</h3>
        <label>Jina la bidhaa</label>
        <input id="spTitle" placeholder="Mfano: PS4 Pro">
        <label>Bei (TZS)</label>
        <input id="spPrice" type="number" min="0">
        <label>Maelezo</label>
        <textarea id="spDesc" rows="3"></textarea>
        <label>Namba ya simu ya kuwasiliana</label>
        <input id="spPhone" placeholder="07XXXXXXXX" inputmode="tel">
        <label>Picha (hadi 2)</label>
        <input id="spImg1" type="file" accept="image/*">
        <input id="spImg2" type="file" accept="image/*">
        <button class="primary" id="spSend" type="button">WEKA BIDHAA</button>
      </div>`;
    $("#spSend").onclick = postProduct;
    return;
  }

  if (sellerState.pending) {
    box.innerHTML = '<div class="pcard"><p class="muted">Ada yako imetumwa. Admin anathibitisha; ukithibitishwa, fomu ya kuweka bidhaa itaonekana hapa.</p></div>';
    return;
  }

  box.innerHTML = `
    <div class="pcard">
      ${sellerState.rejected ? '<p class="muted">Ombi lako la awali lilikataliwa. Tuma tena.</p>' : ""}
      <h3>LIPIA ADA YA DUKA</h3>
      <p class="muted">Lipia kiasi kilichoonyeshwa kisha tuma screenshot. Admin akithibitisha, utaweza kuweka bidhaa.</p>
      <div class="paytable">
        <div class="payrow"><span>Mtandao</span><b>${esc(PAY_INFO.network)}</b></div>
        <div class="payrow"><span>Namba</span><b>${esc(PAY_INFO.number)}</b></div>
        <div class="payrow"><span>Jina</span><b>${esc(PAY_INFO.name)}</b></div>
        <div class="payrow"><span>Kiasi</span><b>TZS ${STORE_FEE}</b></div>
      </div>
      <label>Namba uliyotumia kutuma pesa</label>
      <input id="sfPhone" placeholder="07XXXXXXXX" inputmode="tel">
      <label>Picha ya muamala</label>
      <input id="sfImg1" type="file" accept="image/*">
      <button class="primary" id="sfSend" type="button">NIMELIPA ADA ✓</button>
    </div>`;
  $("#sfSend").onclick = submitStorePayment;
}

async function submitStorePayment() {
  const phone = $("#sfPhone").value.trim();
  const f1 = $("#sfImg1").files[0];

  if (!/^0\d{9}$/.test(phone)) return toast("Weka namba sahihi, mfano 07XXXXXXXX.");
  if (!f1) return toast("Pakia picha ya muamala.");

  const btn = $("#sfSend");
  btn.disabled = true;
  btn.textContent = "INATUMA...";

  try {
    const img = await compressImage(f1, 800, 0.7);
    if (img.length > 900000) throw new Error("Picha ni kubwa mno.");

    await addDoc(collection(db, "paymentRequests"), {
      uid: currentUser.uid,
      kind: "store",
      gameId: "store",
      gameTitle: "ADA YA DUKA",
      price: STORE_FEE,
      payerName: (profile && profile.name) || "Mteja",
      payerPhone: phone,
      images: [img],
      status: "pending",
      createdAt: serverTimestamp()
    });

    toast("Ombi limetumwa. Admin atathibitisha.");
  } catch (e) {
    toast("KOSA: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "NIMELIPA ADA ✓";
  }
}

async function postProduct() {
  const title = $("#spTitle").value.trim();
  const price = Number($("#spPrice").value || 0);
  const desc = $("#spDesc").value.trim();
  const phone = $("#spPhone").value.trim();
  const f1 = $("#spImg1").files[0];
  const f2 = $("#spImg2").files[0];

  if (!title || price <= 0) return toast("Weka jina na bei sahihi.");
  if (!/^0\d{9}$/.test(phone)) return toast("Weka namba sahihi ya simu, mfano 07XXXXXXXX.");

  const btn = $("#spSend");
  btn.disabled = true;
  btn.textContent = "INAWEKA...";

  try {
    const images = [];
    if (f1) images.push(await compressImage(f1, 800, 0.7));
    if (f2) images.push(await compressImage(f2, 800, 0.7));

    const total = images.reduce((n, x) => n + x.length, 0);
    if (total > 900000) throw new Error("Picha ni kubwa mno.");

    await addDoc(collection(db, "products"), {
      sellerUid: currentUser.uid,
      sellerName: (profile && profile.name) || "Mteja",
      title,
      price,
      description: desc,
      phone,
      images,
      status: "active",
      createdAt: serverTimestamp()
    });

    toast("Bidhaa imewekwa.");
    $("#spTitle").value = "";
    $("#spPrice").value = "";
    $("#spDesc").value = "";
  } catch (e) {
    toast("KOSA: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "WEKA BIDHAA";
  }
}

/* ---------- Muonekano kulingana na nafasi (admin hana profile) ---------- */

function applyRoleNav() {
  const profileBtn = document.querySelector('.bnav [data-view="profile"]');
  if (profileBtn) profileBtn.style.display = isAdmin() ? "none" : "";

  const profileView = $("#view-profile");
  if (isAdmin() && profileView && profileView.classList.contains("active")) {
    showView("home");
  }
  renderToken();
}


/* ---------- Dai ya leo na balance ya admin ---------- */

async function claimDaily() {
  openDaily();
}

function startWallet() {
  if (walletUnsub) return;
  walletUnsub = onSnapshot(doc(db, "wallet", "admin"),
    snap => {
      const d = snap.exists() ? snap.data() : {};
      walletBal = Number(d.balance || 0);
      walletView = Number(d.viewEarn || 0);
      walletSignup = Number(d.signupEarn || 0);
      walletDaily = Number(d.dailyEarn || 0);
      renderToken();
    },
    e => console.error("wallet:", e)
  );
}

function stopWallet() {
  if (walletUnsub) {
    walletUnsub();
    walletUnsub = null;
  }
}


/* ---------- Kuhesabu mwonekano: pale kadi inapoonekana kwenye skrini ---------- */

const seenViews = new Set();
let viewIO = null;

function markViewed(gameId) {
  if (!gameId || seenViews.has(gameId)) return;
  seenViews.add(gameId);
  const g = games.find(x => x.id === gameId);
  if (g) recordView(g);
}

function observeCards() {
  if (!("IntersectionObserver" in window)) return;
  if (viewIO) viewIO.disconnect();

  viewIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) markViewed(en.target.dataset.gid);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll("[data-gid]").forEach(el => viewIO.observe(el));
}


/* ---------- Balance ya admin: tukio moja = TZS 1000 ---------- */

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function creditAdmin(kind, amount) {
  await setDoc(doc(db, "wallet", "admin"), {
    balance: increment(amount),
    viewEarn: increment(kind === "view" ? amount : 0),
    signupEarn: increment(kind === "signup" ? amount : 0),
    dailyEarn: increment(kind === "daily" ? amount : 0)
  }, { merge: true });
}

let visitCredited = null;

async function checkDailyVisit() {
  if (!isRegistered() || isAdmin() || !currentUser) return;

  const key = todayKey();
  if (visitCredited === key) return;
  if (profile && profile.lastVisit === key) {
    visitCredited = key;
    return;
  }

  visitCredited = key;
  try {
    await setDoc(doc(db, "users", currentUser.uid), { lastVisit: key }, { merge: true });
  } catch (e) {
    visitCredited = null;
    console.error("daily visit:", e.code, e.message);
  }
}


/* ---------- Takwimu za admin: taarifa halisi tu ---------- */

async function loadStats() {
  const box = $("#balanceCard");
  if (!box || !isAdmin()) return;

  box.innerHTML = "Inapakia takwimu...";

  try {
    const [usersSnap, gamesSnap, paySnap, cmSnap, adsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "games")),
      getDocs(query(collection(db, "paymentRequests"), where("status", "==", "approved"))),
      getDocs(collection(db, "comments")),
      getDoc(doc(db, "settings", "ads"))
    ]);

    const today = todayKey();
    let visitsToday = 0;
    usersSnap.forEach(d => { if (d.data().lastVisit === today) visitsToday++; });

    let views = 0;
    let downloads = 0;
    gamesSnap.forEach(d => {
      views += Number(d.data().views || 0);
      downloads += Number(d.data().downloads || 0);
    });

    let gameRev = 0;
    let storeRev = 0;
    paySnap.forEach(d => {
      const r = d.data();
      if (r.kind === "store") storeRev += Number(r.price || 0);
      else gameRev += Number(r.price || 0);
    });

    const adsUsd = adsSnap.exists() ? Number(adsSnap.data().earnedUsd || 0) : 0;

    box.innerHTML = `
      <div class="bal-row"><span>👤 Waliojisajili</span><b>${usersSnap.size}</b></div>
      <div class="bal-row"><span>📅 Waliongia leo</span><b>${visitsToday}</b></div>
      <div class="bal-row"><span>👁 Mionekano ya games</span><b>${views}</b></div>
      <div class="bal-row"><span>⬇ Downloads</span><b>${downloads}</b></div>
      <div class="bal-row"><span>💬 Maoni</span><b>${cmSnap.size}</b></div>

      <div class="bal-total">Malipo ya wateja: TZS ${(gameRev + storeRev).toLocaleString()}</div>
      <div class="bal-row"><span>🎮 Malipo ya games</span><b>TZS ${gameRev.toLocaleString()}</b></div>
      <div class="bal-row"><span>🛒 Ada za duka</span><b>TZS ${storeRev.toLocaleString()}</b></div>

      <div class="bal-total">Mapato ya matangazo: USD ${adsUsd.toFixed(2)}</div>
      <label>Ingiza mapato yako kutoka dashboard ya Adsterra (USD)</label>
      <input id="adsInput" type="number" min="0" step="0.01" value="${adsUsd}">
      <button class="primary" id="adsSave" type="button">HIFADHI MAPATO YA MATANGAZO</button>
      <button class="secondary" id="statsRefresh" type="button" style="width:100%;margin-top:8px">SASISHA TAKWIMU</button>
    `;

    $("#statsRefresh").onclick = loadStats;
    $("#adsSave").onclick = saveAdsEarnings;
  } catch (e) {
    box.innerHTML = "Imeshindikana kupakia takwimu: " + esc(e.message);
  }
}

async function saveAdsEarnings() {
  const v = Number($("#adsInput").value);
  if (!isFinite(v) || v < 0) return toast("Weka kiasi sahihi.");
  try {
    await setDoc(doc(db, "settings", "ads"), {
      earnedUsd: v,
      updatedAt: serverTimestamp()
    }, { merge: true });
    toast("Mapato ya matangazo yamehifadhiwa.");
    loadStats();
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

/* ---------- Zawadi ya Kila Siku (mfululizo wa siku 7) ---------- */

const DAILY_REWARDS = [10, 10, 15, 15, 20, 25, 50];
let dailyShownFor = null;

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dailyState() {
  const last = profile ? profile.lastDaily : null;

  if (last === todayKey()) {
    const s = Number((profile && profile.streak) || 1);
    const idx = (s - 1) % 7;
    return { claimedToday: true, idx, reward: DAILY_REWARDS[idx] };
  }

  const continuing = last === yesterdayKey();
  const s = continuing ? Number((profile && profile.streak) || 0) : 0;
  const idx = s % 7;
  return { claimedToday: false, idx, reward: DAILY_REWARDS[idx] };
}

function renderDaily() {
  const st = dailyState();
  const grid = $("#dailyGrid");
  if (grid) {
    grid.innerHTML = DAILY_REWARDS.map((r, i) => {
      const done = st.claimedToday ? i <= st.idx : i < st.idx;
      const cur = !st.claimedToday && i === st.idx;
      const cls = done ? "done" : (cur ? "cur" : "lock");
      const icon = done ? "✅" : (cur ? "🎁" : "🔒");
      return `<div class="dday ${cls}"><small>Siku ${i + 1}</small><b>${icon}</b><span>+${r}</span></div>`;
    }).join("");
  }

  const btn = $("#dailyClaim");
  if (btn) {
    btn.disabled = st.claimedToday;
    btn.textContent = st.claimedToday ? "Umeshadai leo — rudi kesho" : "✅ DAI +" + st.reward;
  }
}

function openDaily() {
  if (!isRegistered() || isAdmin()) {
    toast("Ingia kwanza ili upate zawadi.");
    return;
  }
  renderDaily();
  $("#dailyModal").classList.remove("hidden");
}

async function claimDailyReward() {
  if (!isRegistered() || isAdmin()) return;

  const st = dailyState();
  if (st.claimedToday) return;

  const continuing = profile && profile.lastDaily === yesterdayKey();
  const newStreak = (continuing ? Number(profile.streak || 0) : 0) + 1;

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      tokens: increment(st.reward),
      streak: newStreak,
      lastDaily: todayKey()
    }, { merge: true });
    toast("+" + st.reward + " tokeni zimeongezwa!");
    $("#dailyModal").classList.add("hidden");
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

function autoDaily() {
  if (!isRegistered() || isAdmin() || !profile) return;
  const today = todayKey();
  if (profile.lastDaily === today) return;
  if (dailyShownFor === today) return;
  dailyShownFor = today;
  setTimeout(openDaily, 600);
}

function renderCoin() {
  const ta = $("#topAuth");
  if (ta) ta.classList.toggle("hidden", isRegistered());

  const el = $("#coinBar");
  if (!el) return;
  if (!isRegistered() || isAdmin()) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = "🪙 " + Number((profile && profile.tokens) || 0).toLocaleString();
}


/* ---------- Taarifa (kengele) ---------- */

let notifUnsub = null;
let notifItems = [];
let notifInitDone = false;

function notifSeenAt() {
  return Number(localStorage.getItem("medico-notif-seen") || 0);
}

function tsMs(t) {
  return t && t.toMillis ? t.toMillis() : Date.now();
}

function dailyUnclaimed() {
  return isRegistered() && !isAdmin() && !!profile && profile.lastDaily !== todayKey();
}

function startNotifications() {
  if (notifUnsub) return;
  notifUnsub = onSnapshot(
    query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(30)),
    snap => {
      notifItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (notifInitDone) {
        snap.docChanges().forEach(c => {
          if (c.type === "added" && !c.doc.metadata.hasPendingWrites) {
            toast("🔔 " + (c.doc.data().title || "Taarifa mpya"));
          }
        });
      }
      notifInitDone = true;
      renderBell();
      renderNotifPanel();
    },
    e => console.error("notifications:", e)
  );
}

function stopNotifications() {
  if (notifUnsub) {
    notifUnsub();
    notifUnsub = null;
  }
  notifItems = [];
  notifInitDone = false;
}

function renderBell() {
  const dot = $("#bellDot");
  if (!dot) return;
  if (!isRegistered()) {
    dot.classList.add("hidden");
    return;
  }
  const seen = notifSeenAt();
  const unread = notifItems.filter(n => tsMs(n.createdAt) > seen).length + (dailyUnclaimed() ? 1 : 0);
  dot.textContent = unread > 9 ? "9+" : String(unread);
  dot.classList.toggle("hidden", unread === 0);
}

function renderNotifPanel() {
  const box = $("#notifBody");
  if (!box) return;

  let html = "";
  if (dailyUnclaimed()) {
    html += `<div class="nitem"><b>🎁 Zawadi ya Kila Siku</b><small>Umeingia leo. Dai zawadi yako.</small><button class="primary" id="nDaily" type="button">DAI SASA</button></div>`;
  }
  html += notifItems.length
    ? notifItems.map(n => `
        <div class="nitem">
          <b>${esc(n.title || "Taarifa")}</b>
          <small>${esc(n.body || "")}</small>
          <small class="ntime">${esc(fmtDate(n.createdAt))}</small>
        </div>`).join("")
    : '<div class="muted">Hakuna taarifa bado.</div>';

  box.innerHTML = html;

  const d = $("#nDaily");
  if (d) d.onclick = () => {
    $("#notifModal").classList.add("hidden");
    openDaily();
  };
}

function openNotifs() {
  if (!isRegistered()) {
    openAuth("register");
    return;
  }
  renderNotifPanel();
  $("#notifModal").classList.remove("hidden");
  localStorage.setItem("medico-notif-seen", String(Date.now()));
  renderBell();
}

/* ---------- Admin: kutuma taarifa ---------- */

function adminNotices() {
  stopAdminListeners();

  $("#adminContent").innerHTML = `
    <h3>TUMA TAARIFA KWA WATEJA</h3>
    <label>Kichwa</label>
    <input id="nTitle" placeholder="Mfano: Tangazo muhimu">
    <label>Maelezo</label>
    <textarea id="nBody"></textarea>
    <button class="primary" id="nPost" type="button">TUMA TAARIFA</button>
    <h3>ZILIZOTUMWA</h3>
    <div id="nList"></div>
  `;

  $("#nPost").onclick = postNotice;

  const unsub = onSnapshot(
    query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(30)),
    snap => {
      const box = $("#nList");
      if (!box) return;
      box.innerHTML = snap.docs.length
        ? snap.docs.map(d => {
            const n = d.data();
            return `
              <div class="admin-list">
                <strong>${esc(n.title || "")}</strong>
                <small>${esc(n.body || "")}</small>
                <button class="danger" data-ndel="${esc(d.id)}" type="button">FUTA</button>
              </div>`;
          }).join("")
        : '<div class="muted">Hakuna taarifa.</div>';

      box.querySelectorAll("[data-ndel]").forEach(b => {
        b.onclick = async () => {
          try {
            await deleteDoc(doc(db, "notifications", b.dataset.ndel));
            toast("Taarifa imefutwa.");
          } catch (e) {
            toast("KOSA: " + e.message);
          }
        };
      });
    }
  );
  adminUnsubs.push(unsub);
}

async function postNotice() {
  const title = $("#nTitle").value.trim();
  const body = $("#nBody").value.trim();

  if (!title) {
    return toast("Weka kichwa cha taarifa.");
  }

  if (!isAdmin()) {
    return toast("Hujaingia kama Admin. Toka kisha ingia tena kwa Email na Password.");
  }

  const btn = $("#nPost");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "INATUMA...";
  }

  try {
    await addDoc(collection(db, "notifications"), {
      title,
      body,
      kind: "admin",
      createdAt: serverTimestamp()
    });
    $("#nTitle").value = "";
    $("#nBody").value = "";
    toast("Taarifa imetumwa.");
  } catch (e) {
    console.error("postNotice:", e.code, e.message);
    const hint = e.code === "permission-denied"
      ? "Kanuni za Firebase hazijachapishwa, au akaunti yako si ya admin. Chapisha firestore.rules na ingia tena."
      : (e.message || "Kosa lisilojulikana.");
    toast("KOSA (" + (e.code || "") + "): " + hint);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "TUMA TAARIFA";
    }
  }
}


/* ---------- Mtandaoni sasa: mapigo ya moyo kila dakika ---------- */

let heartbeatTimer = null;

function beatOnline() {
  if (!isRegistered() || !currentUser) return;
  setDoc(doc(db, "users", currentUser.uid), { lastSeen: serverTimestamp() }, { merge: true })
    .catch(e => console.error("heartbeat:", e.code, e.message));
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  beatOnline();
  heartbeatTimer = setInterval(beatOnline, 60000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function fmtDateTime(ts) {
  try {
    return ts.toDate().toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
  } catch (e) {
    return "";
  }
}

/* ---------- Admin: orodha ya watumiaji waliojisajili ---------- */

function adminUsers() {
  stopAdminListeners();

  $("#adminContent").innerHTML = `
    <h3>WATEJA WALIOJISAJILI</h3>
    <div class="bal-row"><span>👤 Jumla ya waliojisajili</span><b id="uTotal">0</b></div>
    <div class="bal-row"><span>🟢 Mtandaoni sasa hivi</span><b id="uOnline">0</b></div>
    <div class="bal-row"><span>🆕 Wamejisajili leo</span><b id="uToday">0</b></div>
    <div id="uList" style="margin-top:10px"></div>
  `;

  const unsub = onSnapshot(collection(db, "users"), snap => {
    const now = Date.now();
    const today = todayKey();
    const tsOf = t => (t && t.toMillis) ? t.toMillis() : 0;
    const isOnline = u => tsOf(u.lastSeen) > now - 120000;
    const dayOf = u => tsOf(u.createdAt) ? new Date(tsOf(u.createdAt)).toISOString().slice(0, 10) : "";

    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => tsOf(b.createdAt) - tsOf(a.createdAt));

    const online = rows.filter(isOnline).length;
    const joinedToday = rows.filter(u => dayOf(u) === today).length;

    if ($("#uTotal")) {
      $("#uTotal").textContent = rows.length;
      $("#uOnline").textContent = online;
      $("#uToday").textContent = joinedToday;
    }

    const list = $("#uList");
    if (!list) return;

    list.innerHTML = rows.length
      ? rows.map((u, i) => `
          <div class="admin-list">
            <strong>${i + 1}. ${esc(u.name || "Bila jina")} ${isOnline(u) ? "🟢" : ""}</strong>
            <small>${esc(u.email || "")}</small>
            <small>Amejiunga: ${esc(fmtDate(u.createdAt) || "—")} • Mara ya mwisho: ${esc(tsOf(u.lastSeen) ? fmtDateTime(u.lastSeen) : "—")}</small>
          </div>`).join("")
      : '<div class="muted">Bado hakuna aliyejisajili.</div>';
  }, e => {
    console.error("users list:", e.code, e.message);
    const list = $("#uList");
    if (list) list.innerHTML = "Imeshindikana kupakia watumiaji: " + esc(e.message);
  });

  adminUnsubs.push(unsub);
}

/* ---------- Profile: tarehe na ombi la game ---------- */

function fmtMonthYear(ts) {
  try {
    return ts.toDate().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch (e) {
    return "—";
  }
}

async function sendGameRequest() {
  const input = $("#omName");
  const text = input.value.trim();
  if (!text) return toast("Andika jina la game.");
  if (!isRegistered()) return openAuth("register");

  try {
    await addDoc(collection(db, "gameRequests"), {
      uid: currentUser.uid,
      name: (profile && profile.name) || "Mteja",
      game: text,
      createdAt: serverTimestamp()
    });
    input.value = "";
    toast("Ombi limetumwa. Asante!");
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}


/* ---------- Upakuaji: tangazo kwanza, kisha upakuaji unaanza akirudi ---------- */

let pendingDl = null;

function startDownload(gameId) {
  if (!isRegistered()) {
    toast("Jisajili au ingia kwanza ili upakue.");
    openAuth("register");
    return;
  }
  if (!AD_DIRECT_URL) {
    return download(gameId);
  }
  pendingDl = gameId;
  window.open(AD_DIRECT_URL, "_blank");
  toast("Tangazo linafunguka. Rudi hapa upakuaji utaanza.");
}

async function finishDownload(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game || !game.driveUrl) return toast("Link ya kupakua haipatikani.");

  if (isRegistered() && !isAdmin()) {
    try {
      await recordView(game);
      await setDoc(doc(db, "games", gameId, "viewers", currentUser.uid), {
        name: (profile && profile.name) || "Mteja",
        downloaded: true,
        viewed: true,
        at: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("viewer:", e.code, e.message);
    }
  }

  try {
    await updateDoc(doc(db, "games", gameId), { downloads: increment(1) });
  } catch (e) {
    console.error("download count:", e.code, e.message);
  }

  window.location.href = game.driveUrl;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pendingDl) {
    const id = pendingDl;
    pendingDl = null;
    setTimeout(() => finishDownload(id), 400);
  }
});


/* ---------- Ukuta wa kujisajili: mgeni hawezi kufanya chochote ---------- */

let wallMode = "register";

function showWall() {
  document.body.classList.add("locked");
}

function hideWall() {
  document.body.classList.remove("locked");
}

function setWallMode(mode) {
  wallMode = mode;
  const isReg = mode === "register";
  $("#wNameRow").style.display = isReg ? "block" : "none";
  $("#wTabLogin").classList.toggle("on", !isReg);
  $("#wTabReg").classList.toggle("on", isReg);
  $("#wGo").textContent = isReg ? "JISAJILI NA UENDELEE" : "INGIA NA UENDELEE";
  $("#wMsg").textContent = "";
}





function initWall() {
  if (!$("#wGo")) return;
  setWallMode("register");
  $("#wTabLogin").onclick = () => setWallMode("login");
  $("#wTabReg").onclick = () => setWallMode("register");
  $("#wGo").onclick = () => (wallMode === "register" ? wallRegister() : wallLogin());
  $("#wPass").onkeydown = e => { if (e.key === "Enter") $("#wGo").click(); };
}


/* ---------- Usajili: ujumbe wa makosa kwa kila sehemu ---------- */

function hideAuthModal() {
  const m = $("#authModal");
  if (m) m.classList.add("hidden");
}

function validateSignup(name, email, pass) {
  if (!name || name.length < 2) {
    return "Umesahau kuandika jina lako. Andika jina kamili, mfano: Hemed Mwana.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Email haionekani sahihi. Hakikisha ina @ na nukta, mfano: jina@gmail.com.";
  }
  if (!pass || pass.length < 6) {
    return "Nenosiri ni fupi. Liwe na herufi 6 au zaidi.";
  }
  return "";
}

async function registerAccount(name, email, pass, msgEl, btnEl) {
  const err = validateSignup(name, email, pass);
  if (err) {
    msgEl.textContent = "❌ " + err;
    return;
  }

  msgEl.textContent = "⏳ Subiri, unajisajili...";
  if (btnEl) btnEl.disabled = true;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      tokens: TOKEN_SIGNUP,
      lastDaily: null,
      lastVisit: todayKey(),
      createdAt: serverTimestamp()
    });
    msgEl.textContent = "✅ Umesajiliwa kikamilifu. Karibu " + name + "!";
    hideAuthModal();
    toast("Karibu " + name + "! Umepata " + TOKEN_SIGNUP + " tokeni.");
  } catch (e) {
    console.error("register:", e.code, e.message);
    msgEl.textContent = "❌ " + authErrorText(e);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function loginAccount(email, pass, msgEl, btnEl) {
  if (!email) {
    msgEl.textContent = "❌ Andika email yako.";
    return;
  }
  if (!pass) {
    msgEl.textContent = "❌ Andika nenosiri lako.";
    return;
  }

  msgEl.textContent = "⏳ Subiri, unaingia...";
  if (btnEl) btnEl.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    msgEl.textContent = "✅ Umeingia.";
    hideAuthModal();
    toast("Umeingia.");
  } catch (e) {
    console.error("login:", e.code, e.message);
    msgEl.textContent = "❌ " + authErrorText(e);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function wallRegister() {
  await registerAccount($("#wName").value.trim(), $("#wEmail").value.trim(), $("#wPass").value, $("#wMsg"), $("#wGo"));
}

async function wallLogin() {
  await loginAccount($("#wEmail").value.trim(), $("#wPass").value, $("#wMsg"), $("#wGo"));
}

async function doRegister() {
  await registerAccount($("#aName").value.trim(), $("#aEmail").value.trim(), $("#aPass").value, $("#aMsg"), $("#aGo"));
}

async function doLogin() {
  await loginAccount($("#aEmail").value.trim(), $("#aPass").value, $("#aMsg"), $("#aGo"));
}

/* ---------- Kuanzisha kurasa ---------- */

injectStyles();
injectStyles2();

initWall();

window.showAdmin = showAdmin;

if ($("#isAdminPage")) {
  showAdmin();
}

if ($("#search")) {
  $("#search").oninput = renderGames;
}

document.querySelectorAll(".categories button").forEach(b => {
  b.onclick = () => {
    activeFilter = b.dataset.filter;
    renderGames();
  };
});

document.querySelectorAll(".bnav [data-view]").forEach(b => {
  b.onclick = () => {
    const v = b.dataset.view;
    if ((v === "chat" || v === "profile") && !isRegistered()) {
      toast("Jisajili kwanza.");
      openAuth("register");
      return;
    }
    showView(v);
  };
});

if ($("#chatSend")) {
  $("#chatSend").onclick = sendUserMessage;
  $("#chatInput").onkeydown = e => { if (e.key === "Enter") sendUserMessage(); };
}

document.querySelectorAll("[data-chat]").forEach(b => {
  b.onclick = () => {
    if (!isRegistered()) {
      openAuth("register");
      return;
    }
    setChatMode(b.dataset.chat);
  };
});

if ($("#dailyClaim")) {
  $("#dailyClaim").onclick = claimDailyReward;
}

if ($("#topAuth")) {
  $("#topAuth").onclick = () => openAuth("register");
}

if ($("#bellBtn")) {
  $("#bellBtn").onclick = openNotifs;
}

if ($("#view-home")) {
  showView("home");
}

document.querySelectorAll("[data-close]").forEach(b => {
  b.onclick = () => {
    const id = b.dataset.close;
    if (id === "gameModal") {
      closeGameModal();
      return;
    }
    $("#" + id).classList.add("hidden");
    if (id === "commentsModal" && cmUnsub) { cmUnsub(); cmUnsub = null; }
    if (id === "viewersModal" && vwUnsub) { vwUnsub(); vwUnsub = null; }
  };
});
