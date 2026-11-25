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
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  firebaseConfig,
  ADMIN_UID,
  PAYMENT_NUMBER
} from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = s => document.querySelector(s);

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
    "auth/invalid-email": "Email si sahihi.",
    "auth/invalid-credential": "Email au Password si sahihi, au akaunti haipo.",
    "auth/wrong-password": "Password si sahihi.",
    "auth/user-not-found": "Akaunti haipo.",
    "auth/email-already-in-use": "Email hii imeshasajiliwa. Ingia badala yake.",
    "auth/weak-password": "Password ni dhaifu. Tumia angalau herufi 6.",
    "auth/too-many-requests": "Umejaribu mara nyingi. Subiri kidogo.",
    "auth/operation-not-allowed": "Email/Password haijawashwa kwenye Firebase.",
    "auth/network-request-failed": "Hakuna mtandao au firewall inazuia."
  };
  return map[code] || (e && e.message) || "Kosa lisilojulikana.";
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
  if (document.getElementById("medico-extra-style")) return;
  const s = document.createElement("style");
  s.id = "medico-extra-style";
  s.textContent = `
    .msgs{height:55vh;max-height:430px;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px;background:rgba(7,2,26,.6);border:1px solid rgba(25,211,255,.25);border-radius:12px}
    .bub{max-width:80%;padding:8px 11px;border-radius:12px;font-size:.84rem;line-height:1.4;word-wrap:break-word;white-space:pre-wrap;align-self:flex-start;background:#1a0f40;color:#e9e6ff;border:1px solid rgba(154,147,201,.25)}
    .bub.me{align-self:flex-end;background:linear-gradient(90deg,#19d3ff,#8a2bff);color:#07021a;border:0}
    .bub small{display:block;font-size:.6rem;letter-spacing:.08em;opacity:.85;margin-bottom:2px;font-weight:800}
    .chatform{display:flex;gap:8px;margin-top:10px;align-items:center}
    .chatform input{flex:1;margin:0!important}
    .chatform .primary{width:auto;margin:0;padding:10px 14px;white-space:nowrap}
    .threads{display:flex;flex-direction:column;gap:8px;margin:8px 0 12px;max-height:260px;overflow:auto}
    .thread-item{position:relative;text-align:left;background:rgba(255,255,255,.04);color:#e9e6ff;border:1px solid rgba(25,211,255,.25);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:.8rem}
    .thread-item strong{display:block;font-size:.88rem;color:#fff}
    .thread-item small{display:block;color:#9a93c9;font-size:.72rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:40px}
    .thread-item:hover{border-color:#ff2bd6}
    .unread{position:absolute;right:10px;top:10px;background:#ff2bd6;color:#fff;border-radius:99px;padding:2px 7px;font-size:.66rem;font-weight:900}
    .pcard{background:rgba(20,10,55,.78);border:1px solid rgba(25,211,255,.25);border-radius:14px;padding:18px;max-width:520px;margin:0 auto}
    .pcard label{display:block;font-size:.72rem;color:#19d3ff;margin-top:10px}
    .pcard input{width:100%;padding:10px;margin:5px 0 8px;background:#08031d;color:#e9e6ff;border:1px solid rgba(25,211,255,.3);border-radius:8px;font-size:.85rem}
    .muted{color:#9a93c9;font-size:.8rem}
    .loginmsg{margin-top:10px;font-size:.8rem;color:#ffb3d9;min-height:1em}
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
  stopUserChat();
  profile = null;

  if (isRegistered()) {
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      profile = snap.exists()
        ? snap.data()
        : { name: currentUser.displayName || "", email: currentUser.email || "" };
    } catch (e) {
      console.error("profile:", e);
      profile = { name: currentUser.displayName || "", email: currentUser.email || "" };
    }
    if ($("#chatMsgs")) startUserChat();
  } else if ($("#chatMsgs")) {
    $("#chatMsgs").innerHTML = '<div class="muted">Jisajili au ingia ili uchati na Admin.</div>';
  }

  renderProfile();
}

async function doRegister() {
  const name = $("#aName").value.trim();
  const email = $("#aEmail").value.trim();
  const pass = $("#aPass").value;
  const msg = $("#aMsg");

  if (!name || !email || !pass) {
    msg.textContent = "Jaza jina, email na password.";
    return;
  }
  if (pass.length < 6) {
    msg.textContent = "Password iwe angalau herufi 6.";
    return;
  }

  msg.textContent = "Inajisajili...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      createdAt: serverTimestamp()
    });
    await loadProfile();
    $("#authModal").classList.add("hidden");
    toast("Karibu " + name + "! Umesajiliwa.");
  } catch (e) {
    console.error("register:", e.code, e.message);
    msg.textContent = "KOSA: " + authErrorText(e);
  }
}

async function doLogin() {
  const email = $("#aEmail").value.trim();
  const pass = $("#aPass").value;
  const msg = $("#aMsg");

  if (!email || !pass) {
    msg.textContent = "Weka email na password.";
    return;
  }

  msg.textContent = "Inaingia...";

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    $("#authModal").classList.add("hidden");
    toast("Umeingia.");
  } catch (e) {
    console.error("login:", e.code, e.message);
    msg.textContent = "KOSA: " + authErrorText(e);
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
      <label>Jina lako</label>
      <input id="aName" placeholder="Jina kamili">
    ` : ""}
    <label>Email</label>
    <input id="aEmail" type="email" placeholder="Email">
    <label>Password (angalau herufi 6)</label>
    <input id="aPass" type="password" placeholder="Password">
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
  document.querySelectorAll(".view").forEach(v => {
    v.classList.toggle("active", v.id === "view-" + name);
  });
  document.querySelectorAll(".bnav [data-view]").forEach(b => {
    b.classList.toggle("on", b.dataset.view === name);
  });
  window.scrollTo(0, 0);
}

function renderProfile() {
  const box = $("#profileBox");
  if (!box) return;

  if (!isRegistered()) {
    box.innerHTML = `
      <div class="pcard">
        <h3>HAUJAINGIA</h3>
        <p class="muted">Jisajili au ingia ili uone profile yako na kuchati na Admin.</p>
        <button class="primary" id="pAuth" type="button">INGIA / JISAJILI</button>
      </div>`;
    $("#pAuth").onclick = () => openAuth("login");
    return;
  }

  box.innerHTML = `
    <div class="pcard">
      <h3>PROFILE YANGU</h3>
      <label>Jina</label>
      <input id="pName" value="${esc(profile && profile.name ? profile.name : "")}">
      <label>Email</label>
      <input value="${esc(currentUser.email || "")}" disabled>
      <button class="primary" id="pSave" type="button">HIFADHI JINA</button>
      <button class="secondary" id="pLogout" type="button" style="margin-top:10px;width:100%">TOKA</button>
    </div>`;

  $("#pSave").onclick = saveProfileName;
  $("#pLogout").onclick = logout;
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

function startUserChat() {
  stopUserChat();
  const box = $("#chatMsgs");
  if (!box || !currentUser) return;

  userChatUnsub = onSnapshot(
    query(collection(db, "chats", currentUser.uid, "messages"), orderBy("createdAt", "asc")),
    snap => {
      renderMessages($("#chatMsgs"), snap.docs.map(d => d.data()), "user");
    },
    e => {
      console.error("user chat:", e);
      box.innerHTML = '<div class="muted">Imeshindikana kupakia ujumbe: ' + esc(e.message) + "</div>";
    }
  );
}

async function sendUserMessage() {
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;

  if (!isRegistered()) {
    openAuth("login");
    return;
  }

  input.value = "";

  try {
    const uid = currentUser.uid;

    await addDoc(collection(db, "chats", uid, "messages"), {
      uid,
      from: "user",
      name: (profile && profile.name) || "Mteja",
      text,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "chats", uid), {
      uid,
      name: (profile && profile.name) || "Mteja",
      email: currentUser.email || "",
      lastText: text,
      lastAt: serverTimestamp(),
      unreadAdmin: increment(1)
    }, { merge: true });

  } catch (e) {
    input.value = text;
    toast("Ujumbe haukutumwa: " + e.message);
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

function renderGames() {
  if (!$("#search") || !$("#gameGrid")) return;

  const term = $("#search").value.toLowerCase();

  const shown = games.filter(g =>
    (
      activeFilter === "all" ||
      g.category === activeFilter ||
      (Array.isArray(g.tags) && g.tags.includes(activeFilter))
    ) &&
    (`${g.title} ${g.description} ${g.category}`)
      .toLowerCase().includes(term)
  );

  $("#gameGrid").innerHTML = shown.length
    ? shown.map(g => `
      <article class="game-card">
        <div class="cover-wrap">
          <img class="cover" loading="lazy" alt="${esc(g.title)}"
            src="${esc(g.imageUrl || "https://placehold.co/640x360/20324a/ffffff?text=MEDICO+GAMING")}">
          <span class="badge ${g.paid ? "paid" : ""}">${g.paid ? money(g.price) : "BURE"}</span>
        </div>
        <div class="game-info">
          <h3>${esc(g.title)}</h3>
          ${fmtDate(g.createdAt) ? `<small class="date">${fmtDate(g.createdAt)}</small>` : ""}
          <p>${esc(g.description || "Pakua na ufurahie gemu.")}</p>
          <div class="chips">
            <span class="chip">${esc(g.category)}</span>
          </div>
          <button class="open-game" data-game="${esc(g.id)}" type="button">
            ${g.paid ? "LIPA / ANGALIA" : "FUNGUA"}
          </button>
          <div class="card-actions">
            <span class="dl-pill">⬇ ${Number(g.downloads || 0)}</span>
            <button class="maoni-btn" data-comments="${esc(g.id)}" type="button">💬 Maoni (${Number(g.commentCount || 0)})</button>
            <button class="share-game" data-share="${esc(g.id)}" type="button">Share</button>
          </div>
        </div>
      </article>
    `).join("")
    : '<div class="empty">Hakuna gemu lililopatikana.</div>';

  document.querySelectorAll("[data-game]").forEach(b => {
    b.onclick = () => showGame(b.dataset.game);
  });

  document.querySelectorAll("[data-share]").forEach(b => {
    b.onclick = () => shareGame(b.dataset.share);
  });

  document.querySelectorAll("[data-comments]").forEach(b => {
    b.onclick = () => openComments(b.dataset.comments);
  });
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

function showGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;

  $("#gameDetails").innerHTML = `
    <h2>${esc(g.title)}</h2>
    <p>${esc(g.description || "")}</p>
    <div class="paybox">
      ${g.paid
        ? `Bei: <b>${money(g.price)}</b><br>
           Namba ya malipo: <b>${esc(PAYMENT_NUMBER)}</b><br>
           Tuma pesa kisha jaza taarifa zako.`
        : "Gemu hili ni bure."}
    </div>
    ${g.paid ? `
      <label>Jina la mtumaji</label>
      <input id="payerName" placeholder="Jina lako">
      <label>Namba ya simu</label>
      <input id="payerPhone" placeholder="07XXXXXXXX">
      <label>Namba ya muamala</label>
      <input id="txn" placeholder="Transaction ID">
      <button class="primary" id="requestPay" type="button">TUMA OMBI</button>
      <p class="muted">Subiri Admin athibitishe malipo yako.</p>
    ` : `
      <button class="primary" id="downloadGame" type="button">PAKUA GEMU</button>
    `}
  `;

  $("#gameModal").classList.remove("hidden");

  if (g.paid) {
    $("#requestPay").onclick = async () => {
      if (!isRegistered()) {
        $("#gameModal").classList.add("hidden");
        toast("Jisajili kwanza ili ulipie gemu.");
        openAuth("register");
        return;
      }

      const name = $("#payerName").value.trim();
      const phone = $("#payerPhone").value.trim();
      const txn = $("#txn").value.trim();

      if (!name || !phone || !txn) {
        return toast("Jaza taarifa zote.");
      }

      try {
        await addDoc(collection(db, "paymentRequests"), {
          uid: currentUser.uid,
          gameId: g.id,
          gameTitle: g.title,
          payerName: name,
          payerPhone: phone,
          transactionRef: txn,
          status: "pending",
          createdAt: serverTimestamp()
        });

        toast("Ombi limetumwa. Subiri Admin.");
      } catch (e) {
        toast(e.message);
      }
    };
  } else {
    $("#downloadGame").onclick = () => download(g.id);
  }
}

async function download(gameId) {
  const game = games.find(g => g.id === gameId);

  if (!game || !game.driveUrl) {
    return toast("Link ya kupakua haipatikani.");
  }

  window.open(game.driveUrl, "_blank");

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
    <p class="muted">Usimamizi wa magemu, malipo na mazungumzo.</p>
    <div class="tabs">
      <button class="secondary" id="tabGames" type="button">MAGEMU</button>
      <button class="secondary" id="tabChat" type="button">CHAT</button>
      <button class="secondary" id="tabPayments" type="button">MALIPO</button>
      <button class="secondary" id="adminLogout" type="button">TOKA</button>
    </div>
    <div id="adminContent"></div>
  `;

  $("#tabGames").onclick = adminGames;
  $("#tabChat").onclick = adminChats;
  $("#tabPayments").onclick = adminPayments;

  $("#adminLogout").onclick = async () => {
    stopAdminListeners();
    await signOut(auth);
    showAdmin();
  };

  adminGames();
}

function adminGames() {
  stopAdminListeners();

  $("#adminContent").innerHTML = `
    <h3>ONGEZA GEMU</h3>
    <label>Jina la gemu</label>
    <input id="gTitle" placeholder="Jina la gemu">

    <label>Aina</label>
    <select id="gCat">
      <option>PPSSPP</option>
      <option>Android</option>
      <option>PC</option>
    </select>

    <label>Maelezo</label>
    <textarea id="gDesc"></textarea>

    <label>Bei (0 = bure)</label>
    <input id="gPrice" type="number" min="0">

    <label>Picha ya gemu (chagua kutoka simu)</label>
    <input id="gImageFile" type="file" accept="image/*">
    <img id="gPreview" alt="" style="display:none;max-width:100%;border-radius:8px;margin-bottom:10px">

    <label>AU URL ya picha (hiari)</label>
    <input id="gImage" placeholder="https://...">

    <label>Google Drive Download Link</label>
    <input id="gFile" type="url" placeholder="Bandika link ya Google Drive">

    <button class="primary" id="saveGame" type="button">HIFADHI GEMU</button>

    <h3>MAGEMU YALIYOPO</h3>
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
        <strong>${esc(g.title)}</strong>
        <small>${g.paid ? money(g.price) : "BURE"}</small>
        <button class="danger" data-delete-game="${esc(g.id)}" type="button">FUTA GEMU</button>
      </div>
    `).join("")
    : '<div class="muted">Hakuna gemu bado.</div>';

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
      category: $("#gCat").value,
      description: $("#gDesc").value.trim(),
      price,
      paid: price > 0,
      imageUrl,
      driveUrl,
      createdAt: serverTimestamp()
    });

    toast("Gemu limehifadhiwa.");
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

    const reqs = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    $("#adminContent").innerHTML =
      "<h3>MAOMBI YA MALIPO</h3>" +
      (reqs.length ? reqs.map(r => `
        <div class="admin-list">
          <strong>${esc(r.gameTitle)}</strong>
          <small>${esc(r.payerName)} • ${esc(r.payerPhone)}</small>
          <small>Muamala: ${esc(r.transactionRef)}</small>
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
      await setDoc(doc(db, "entitlements", `${data.uid}_${data.gameId}`), {
        uid: data.uid,
        gameId: data.gameId,
        approvedAt: serverTimestamp()
      });
    }

    toast(approve ? "MALIPO YAMETHIBITISHWA" : "OMBI LIMEKATALIWA");
    adminPayments();

  } catch (e) {
    toast(e.message);
  }
}

/* ---------- Kuanzisha kurasa ---------- */

injectStyles();

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
    if (v === "chat" && !isRegistered()) {
      toast("Jisajili kwanza ili uchati na Admin.");
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

if ($("#view-home")) {
  showView("home");
}

document.querySelectorAll("[data-close]").forEach(b => {
  b.onclick = () => {
    $("#" + b.dataset.close).classList.add("hidden");
    if (b.dataset.close === "commentsModal" && cmUnsub) {
      cmUnsub();
      cmUnsub = null;
    }
  };
});
