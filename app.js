
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
  setDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import {
  firebaseConfig,
  ADMIN_UID,
  PAYMENT_NUMBER
} from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

const $ = s => document.querySelector(s);

let currentUser = null;
let games = [];
let activeFilter = "all";
let gamesUnsubscribe = null;

function toast(message) {
  const t = $("#toast");
  if (!t) {
    alert(message);
    return;
  }
  t.textContent = message;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 3000);
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
  return currentUser && currentUser.uid === ADMIN_UID;
}

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user && !$("#isAdminPage")) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      toast("Imeshindikana kuingia. Hakiki Firebase Authentication.");
    }
  }

  if (user) {
    await loadGames();

    if (isAdmin() && $("#isAdminPage")) {
      adminDashboard();
    }
  }
});

async function loadGames() {
  try {
    if (gamesUnsubscribe) gamesUnsubscribe();

    gamesUnsubscribe = onSnapshot(collection(db, "games"), snap => {
      games = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      renderGames();

      if (
        isAdmin() &&
        $("#adminContent") &&
        $("#adminContent").querySelector("#adminGameList")
      ) {
        $("#adminGameList").innerHTML = games.map(g => `
          <div class="admin-list">
            <strong>${esc(g.title)}</strong>
            <small>${g.paid ? money(g.price) : "BURE"}</small>
          </div>
        `).join("");
      }
    }, e => {
      console.error(e);
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
      g.tags?.includes(activeFilter)
    ) &&
    (`${g.title} ${g.description} ${g.category}`)
      .toLowerCase().includes(term)
  );

  $("#gameGrid").innerHTML = shown.length
    ? shown.map(g => `
      <article class="game-card">
        <img class="cover"
          src="${esc(g.imageUrl || "https://placehold.co/640x360/20324a/ffffff?text=MEDICO+GAMING")}">
        <div class="game-info">
          <span class="tag">${esc(g.category)}</span>
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.description || "Pakua na ufurahie gemu.")}</p>
          <div class="card-bottom">
            <span class="price">${g.paid ? money(g.price) : "BURE"}</span>
            <button class="open-game" data-game="${g.id}">
              ${g.paid ? "LIPA / ANGALIA" : "FUNGUA"}
            </button>
          </div>
        </div>
      </article>
    `).join("")
    : "<div>Hakuna gemu lililopatikana.</div>";

  document.querySelectorAll("[data-game]").forEach(b => {
    b.onclick = () => showGame(b.dataset.game);
  });
}

async function showGame(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;

  $("#gameDetails").innerHTML = `
    <h2>${esc(g.title)}</h2>
    <p>${esc(g.description || "")}</p>
    <div class="paybox">
      ${g.paid
        ? `Bei: <b>${money(g.price)}</b><br>
           Namba ya malipo: <b>${PAYMENT_NUMBER}</b><br>
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
      <button class="primary" id="requestPay">TUMA OMBI</button>
      <p>Subiri Admin athibitishe malipo yako.</p>
    ` : `
      <button class="primary" id="downloadGame">PAKUA GEMU</button>
    `}
  `;

  $("#gameModal").classList.remove("hidden");

  if (g.paid) {
    $("#requestPay").onclick = async () => {
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


function download(gameId) {
  const game = games.find(g => g.id === gameId);

  if (!game || !game.driveUrl) {
    return toast("Link ya kupakua haipatikani.");
  }

  window.open(game.driveUrl, "_blank");
}

  try {
    const fn = httpsCallable(functions, "getGameDownloadUrl");
    const result = await fn({ gameId });
    window.location.href = result.data.url;
  } catch (e) {
    toast(e.message || "Hujaruhusiwa kupakua gemu.");
  }
}

function showAdmin() {
  $("#adminModal").classList.remove("hidden");
alert("SHOW ADMIN INAFANYA KAZI");
  if (isAdmin()) {
    adminDashboard();
    return;
  }

  $("#adminArea").innerHTML = `
    <h2 style="color:#8bc8fa">MEDICO ADMIN LOGIN</h2>
    <p>Sehemu ya mmiliki pekee.</p>
    <label>Email ya Admin</label>
    <input id="adminEmail" type="email">
    <label>Password</label>
    <input id="adminPass" type="password">
    <button class="primary" id="adminLogin">INGIA</button>
  `;

  $("#adminLogin").onclick = async () => {
  alert("KITufe CHA INGIA KINAJIBU");

  
const email = $("#adminEmail").value.trim();
const password = $("#adminPass").value;
    if (!email || !password) {
      return toast("Weka Email na Password.");
    }

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (result.user.uid !== ADMIN_UID) {
        await signOut(auth);
        currentUser = null;
        throw Error("Hii si akaunti ya Admin.");
      }

      currentUser = result.user;
      adminDashboard();

    } catch (e) {
      toast("KOSA: " + (e.code || e.message));
    }
  };
}

function adminDashboard() {
  $("#adminArea").innerHTML = `
    <h2 style="color:#8bc8fa">MEDICO ADMIN PANEL</h2>
    <p>Usimamizi wa magemu na malipo.</p>
    <button class="secondary" id="tabGames">MAGEMU</button>
    <button class="secondary" id="tabPayments">MALIPO</button>
    <button class="secondary" id="adminLogout">TOKA</button>
    <div id="adminContent"></div>
  `;

  $("#tabGames").onclick = adminGames;
  $("#tabPayments").onclick = adminPayments;

  $("#adminLogout").onclick = async () => {
    await signOut(auth);
    currentUser = null;
    $("#adminModal").classList.add("hidden");
  };

  adminGames();
}

function adminGames() {
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

    <label>URL ya picha</label>
    <input id="gImage">

    <label>Google Drive Download Link</label>
<input id="gFile" type="url" placeholder="Bandika link ya Google Drive">

    <button class="primary" id="saveGame">HIFADHI GEMU</button>
    <div id="adminGameList"></div>
  `;

  $("#saveGame").onclick = () => {
  alert("KITufe CHA KUHIFADHI KINAJIBU");
  saveGame();
};

  $("#adminGameList").innerHTML = games.map(g => `
    <div class="admin-list">
      <strong>${esc(g.title)}</strong>
      <small>${g.paid ? money(g.price) : "BURE"}</small>
    </div>
  `).join("");
}


async function saveGame() {
  const title = $("#gTitle").value.trim();
  const driveUrl = $("#gFile").value.trim();
  const price = Number($("#gPrice").value || 0);

  if (!title || !driveUrl) {
    return toast("Weka jina na Google Drive link.");
  }

  try {
    const id = crypto.randomUUID();

    await setDoc(doc(db, "games", id), {
      title,
      category: $("#gCat").value,
      description: $("#gDesc").value.trim(),
      price,
      paid: price > 0,
      imageUrl: $("#gImage").value.trim(),
      driveUrl,
      createdAt: serverTimestamp()
    });

    toast("Gemu limehifadhiwa.");
    adminGames();
  } catch (e) {
    toast("KOSA: " + e.message);
  }
}

  const title = $("#gTitle").value.trim();
  const file = $("#gFile").files[0];
  const price = Number($("#gPrice").value || 0);

  if (!title || !file) {
    return toast("Weka jina na faili la gemu.");
  }

  try {
    const id = crypto.randomUUID();
    const path = `games/${id}/${file.name}`;

    alert("INAPAKIA FAILI...");
await uploadBytes(ref(storage, path), file);
alert("FAILi LIMEPakiwa!");

    await setDoc(doc(db, "games", id), {
      title,
      category: $("#gCat").value,
      description: $("#gDesc").value.trim(),
      price,
      paid: price > 0,
      imageUrl: $("#gImage").value.trim(),
      storagePath: path,
      createdAt: serverTimestamp()
    });

    toast("Gemu limehifadhiwa.");
    adminGames();
  } catch (e) {
    toast(e.message);
  }
}

async function adminPayments() {
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
          <button class="primary" data-approve="${r.id}">THIBITISHA</button>
          <button class="danger" data-reject="${r.id}">KATAA</button>
        </div>
      `).join("") : "Hakuna maombi yanayosubiri.");

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
      await setDoc(doc(db, "entitlements",
        `${data.uid}_${data.gameId}`), {
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

if ($("#adminOpen")) {
  $("#adminOpen").onclick = showAdmin;
}

if ($("#openAdminDashboard")) {
  $("#openAdminDashboard").addEventListener("click", () => {
    showAdmin();
  });
}

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

document.querySelectorAll("[data-close]").forEach(b => {
  b.onclick = () => $("#" + b.dataset.close).classList.add("hidden");
});
