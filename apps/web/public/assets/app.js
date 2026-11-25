const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
let catalog = [],
  stores = [],
  selectedStore = null,
  currentUser = null,
  cart = JSON.parse(sessionStorage.getItem("stillgood-cart-v2") || "{}"),
  category = "Semua",
  pickup = "pickup",
  payment = "QRIS",
  lastOrder = null,
  timerHandle = null,
  nearLocation = null;
const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
async function api(url, options = {}) {
  const headers = {
    Accept: "application/json",
    "X-CSRF-TOKEN": csrf,
    ...(sessionStorage.getItem("stillgood-token")
      ? { Authorization: "Bearer " + sessionStorage.getItem("stillgood-token") }
      : {}),
    ...(options.headers || {}),
  };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  let data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || "Terjadi kesalahan. Coba lagi.");
  return data;
}
function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}
function requireLogin(action = "melanjutkan") {
  if (currentUser) return true;
  showLogin();
  openModal("account-modal");
  toast(`Masuk sebagai pembeli untuk ${action}.`);
  return false;
}
function requireBuyer(action = "melanjutkan") {
  if (!requireLogin(action)) return false;
  if (currentUser.role !== "buyer") {
    toast("Fitur transaksi hanya tersedia untuk akun pembeli.");
    return false;
  }
  return true;
}
function showPage(name) {
  if (name === "home" && currentUser?.role === "seller") name = "seller";
  if (
    ["history", "impact"].includes(name) &&
    !requireLogin(
      "melihat " + (name === "history" ? "riwayat pesanan" : "dampak pribadi")
    )
  )
    return;
 if (name === "orders" && currentUser?.role !== "seller") {
   if (!currentUser) requireLogin("melihat pesanan masuk");
   return;
 }
 if (name === "seller" && currentUser?.role !== "seller") {
   if (!currentUser) requireLogin("membuka toko penjual");
   return;
 }
  if (name === "admin" && currentUser?.role !== "admin") {
    if (!currentUser) requireLogin("membuka pengaturan");
    return;
  }
  if (name === "home") {
    selectedStore = null;
    document.getElementById("home-page").classList.remove("store-open");
    document.getElementById("store-directory-head").hidden = false;
    document.getElementById("store-detail-view").hidden = true;
    loadStores();
  }
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(name + "-page")?.classList.add("active");
  const navName = name === "seller" ? "home" : name;
  document
    .querySelectorAll(".nav-link")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === navName));
  if (name === "history") loadOrders();
  if (name === "orders") loadIncoming();
  if (name === "seller") {
    showSellerHome();
    loadSeller();
  }
  if (name === "admin") loadAdmin();
  if (name === "impact") updateImpact();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showSellerHome() {
  const home = document.getElementById("seller-home"),
    workspace = document.getElementById("seller-workspace");
  if (home) home.hidden = false;
  if (workspace) workspace.hidden = true;
}
function showSellerStore() {
  if (currentUser?.role !== "seller") return;
  document.getElementById("seller-home").hidden = true;
  document.getElementById("seller-workspace").hidden = false;
  loadSeller();
}
function openAccount() {
  if (!currentUser) showLogin();
  openModal("account-modal");
}
function setCategoryFilter(b) {
  document
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.remove("selected"));
  b.classList.add("selected");
  category = b.dataset.category;
  selectedStore ? loadProducts() : loadStores();
}
async function loadPublicCategories() {
  try {
    const rows = await api("/api/categories"),
      filters = document.getElementById("filters"),
      select = document.querySelector('#product-form select[name="category"]');
    rows.forEach((c) => {
      if (
        ![...filters.querySelectorAll(".chip")].some(
          (x) => x.dataset.category === c.name
        )
      ) {
        const b = document.createElement("button");
        b.className = "chip";
        b.dataset.category = c.name;
        b.textContent = c.name;
        b.onclick = () => setCategoryFilter(b);
        filters.insertBefore(b, document.querySelector(".nearby"));
      }
      if (![...select.options].some((x) => x.value === c.name))
        select.add(new Option(c.name, c.name));
    });
  } catch (e) {}
}
function openModal(id) {
  document.getElementById(id).classList.add("show");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}
function showRegister() {
  document.getElementById("account-content").innerHTML = `
    <div class="auth-brand"><img src="/assets/figma-logo.png" alt="Still Good"></div>
    <span class="eyebrow auth-eyebrow">AKUN STILL GOOD · PEMBELI</span>
    <h2>Buat akun <span>baikmu.</span></h2>
    <form id="register-form" class="auth-form">
      <label>Nama<input name="name" required maxlength="100" autocomplete="name" placeholder="Nama lengkap"></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="nama@email.com"></label>
      <label>Kata sandi<input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="Minimal 8 karakter"></label>
      <label>Konfirmasi kata sandi<input name="password_confirmation" type="password" minlength="8" required autocomplete="new-password" placeholder="Ulangi kata sandi"></label>
      <label>No. HP<input name="phone" type="tel" required maxlength="30" autocomplete="tel" placeholder="08xxxxxxxxxx"></label>
      <button class="primary-btn wide auth-submit">Register <span>→</span></button>
    </form>
    <button class="text-link account-switch" type="button" onclick="showLogin()">Sudah punya akun? Login</button>`;
  document.getElementById("register-form").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (d.password !== d.password_confirmation) {
      toast("Konfirmasi kata sandi tidak sama.");
      return;
    }
    try {
      const me = await api("/api/register", {
        method: "POST",
        body: JSON.stringify(d),
      });
      sessionStorage.setItem("stillgood-token", me.token);
      accountReady(me);
      closeModal("account-modal");
      toast("Akun pembeli berhasil dibuat.");
    } catch (err) {
      toast(err.message);
    }
  };
}
function showLogin() {
  document.getElementById("account-content").innerHTML = `
    <div class="auth-brand"><img src="/assets/figma-logo.png" alt="Still Good"></div>
    <span class="eyebrow auth-eyebrow">AKUN STILL GOOD</span>
    <h2>Masuk ke <span>Still Good.</span></h2>
    <div class="auth-tabs" role="tablist" aria-label="Jenis akun">
      <button type="button" class="active" data-role="buyer" role="tab" aria-selected="true">Pembeli</button>
      <button type="button" data-role="seller" role="tab" aria-selected="false">Penjual</button>
      <button type="button" data-role="admin" role="tab" aria-selected="false">Admin</button>
    </div>
    <form id="login-form" class="auth-form">
      <input type="hidden" name="role" value="buyer">
      <label>Email<input name="email" type="email" required autocomplete="username" placeholder="nama@email.com"></label>
      <label>Kata sandi<input name="password" type="password" required autocomplete="current-password" placeholder="Minimal 8 karakter"></label>
      <button class="primary-btn wide auth-submit">Masuk sebagai pembeli <span>→</span></button>
    </form>
    <button id="buyer-register-switch" class="text-link account-switch" type="button" onclick="showRegister()">Belum punya akun? Daftar</button>
    <p id="manual-account-note" class="auth-note" hidden>Akun penjual dan admin dibuat oleh pengelola. Hubungi administrator untuk memperoleh akses.</p>`;

  const tabs = [...document.querySelectorAll(".auth-tabs button")];
  const registerLink = document.getElementById("buyer-register-switch");
  const manualNote = document.getElementById("manual-account-note");
  const labels = { buyer: "pembeli", seller: "penjual", admin: "admin" };
  function selectRole(role) {
    tabs.forEach((tab) => {
      const active = tab.dataset.role === role;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelector('#login-form [name="role"]').value = role;
    document.querySelector(
      "#login-form .auth-submit"
    ).innerHTML = `Masuk sebagai ${labels[role]} <span>→</span>`;
    registerLink.hidden = role !== "buyer";
    manualNote.hidden = role === "buyer";
  }
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => selectRole(tab.dataset.role))
  );
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const me = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      sessionStorage.setItem("stillgood-token", me.token);
      accountReady(me);
      closeModal("account-modal");
      toast("Berhasil masuk, " + me.name + ".");
    } catch (err) {
      toast(err.message);
    }
  };
}
function renderSellerStore() {
  if (currentUser?.role !== "seller") return;
  const store = currentUser.store || {},
    name = store.name || currentUser.name || "Nama Toko",
    address = store.address || "Alamat";
  document.getElementById("seller-store-home-name").textContent = name;
  document.getElementById("seller-workspace-name").textContent = name;
  document.getElementById("seller-store-home-address").textContent = address;
  document.getElementById("seller-store-rating").textContent = "…";
  const photo = document.getElementById("seller-store-photo");
  photo.innerHTML = store.logo
    ? `<img src="${esc(store.logo)}" alt="Foto toko ${esc(name)}">`
    : "";
}
function openStoreEdit() {
  if (currentUser?.role !== "seller") {
    toast("Masuk dengan akun penjual untuk mengubah toko.");
    return;
  }
  const form = document.getElementById("store-edit-form");
  form.elements.store_name.value = currentUser.store?.name || "";
  form.elements.store_address.value = currentUser.store?.address || "";
  form.elements.logo.value = "";
  openModal("store-edit-modal");
}
document
  .getElementById("store-edit-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    if (currentUser?.role !== "seller") return;
    const form = e.currentTarget,
      payload = new FormData(form);
    payload.append("name", currentUser.name || "");
    payload.append("phone", currentUser.phone || "");
    payload.append("address", currentUser.address || "");
    payload.append("bank_account", currentUser.store?.bank_account || "");
    try {
      const saved = await api("/api/profile", {
        method: "POST",
        body: payload,
      });
      currentUser = saved;
      renderSellerStore();
      closeModal("store-edit-modal");
      toast("Informasi toko berhasil disimpan.");
      loadStores();
    } catch (err) {
      toast(err.message);
    }
  });
function accountReady(me) {
  if (!me || !me.id) return;
  currentUser = me;
  syncRoleNav();
  if (me.role !== "buyer") {
    cart = {};
    sessionStorage.removeItem("stillgood-cart-v2");
  }
  renderCartCount();
  document.querySelector(".topbar").classList.add("authenticated");
  const profile = document.querySelector(".profile");
  profile.title = me.name;
  profile.innerHTML = '<img src="/assets/figma-profile.png" alt="">';
  if (me.role === "seller") renderSellerStore();
  document.getElementById("buyer-name").value = me.name || "";
  document.getElementById("buyer-phone").value = me.phone || "";
  document.getElementById(
    "account-content"
  ).innerHTML = `<h2>Profil <span>baikmu.</span></h2><form id="profile-form"><label>Nama<input name="name" required value="${esc(
    me.name
  )}"></label><label>Email<input value="${esc(
    me.email
  )}" disabled></label><label>Nomor telepon<input name="phone" value="${esc(
    me.phone || ""
  )}"></label><label>Alamat utama<input name="address" value="${esc(
    me.address || ""
  )}"></label>${
    me.role === "seller"
      ? `<label>Nama toko<input name="store_name" required value="${esc(
          me.store?.name || ""
        )}"></label><label>Alamat toko<input name="store_address" value="${esc(
          me.store?.address || ""
        )}"></label><label>Rekening pencairan<input name="bank_account" value="${esc(
          me.store?.bank_account || ""
        )}"></label>`
      : ""
  }<button class="primary-btn wide">Simpan profil</button></form>${
    me.role === "seller"
      ? "<button class=\"secondary-btn wide\" onclick=\"closeModal('account-modal');showPage('seller')\">Buka toko saya</button>"
      : ""
  }${
    me.role === "admin"
      ? "<button class=\"secondary-btn wide\" onclick=\"closeModal('account-modal');showPage('admin')\">Kelola kategori</button>"
      : ""
  }<button class="secondary-btn wide" onclick="logout()">Keluar dari akun</button>`;
  document.getElementById("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const saved = await api("/api/profile", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      accountReady(saved);
      toast("Profil disimpan.");
    } catch (err) {
      toast(err.message);
    }
  };
  showPage(
    me.role === "seller" ? "seller" : me.role === "admin" ? "admin" : "home"
  );
}
async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    sessionStorage.removeItem("stillgood-token");
    sessionStorage.removeItem("stillgood-cart-v2");
    location.reload();
  } catch (e) {
    toast(e.message);
  }
}
async function loadStores() {
  selectedStore = null;
  const q = document.getElementById("search").value.trim();
  try {
    stores = await api(
      "/api/stores?" +
        new URLSearchParams({ q, category, ...(nearLocation || {}) })
    );
    if (nearLocation)
      stores.sort((a, b) => storeDistance(a) - storeDistance(b));
    renderStores();
  } catch (e) {
    document.getElementById("store-list").innerHTML =
      '<div class="loading">Belum dapat memuat daftar toko. Coba muat ulang halaman.</div>';
  }
}
function storeDistance(s) {
  if (!nearLocation || s.latitude == null || s.longitude == null)
    return Number.POSITIVE_INFINITY;
  const r = (x) => (x * Math.PI) / 180,
    dLat = r(s.latitude - nearLocation.lat),
    dLng = r(s.longitude - nearLocation.lng),
    a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(r(nearLocation.lat)) *
        Math.cos(r(s.latitude)) *
        Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function renderStores() {
  const grid = document.getElementById("store-list");
  document.getElementById("result-count").textContent = stores.length;
  if (!stores.length) {
    grid.innerHTML =
      '<div class="empty-listing"><b>Belum ada toko terdaftar.</b><small>Toko akan tampil di sini setelah penjual membuat tokonya.</small></div>';
    return;
  }
  grid.innerHTML = stores
    .map(
      (s) =>
        `<button class="store-card" onclick="openStore(${
          s.id
        })"><span class="store-card-photo">${
          s.cover_image
            ? `<img src="${esc(s.cover_image)}" alt="Foto toko ${esc(s.name)}">`
            : '<span class="store-card-placeholder" aria-hidden="true"></span>'
        }<span class="store-card-open">Lihat toko <i>→</i></span></span><span class="store-card-info"><b>${esc(
          s.name
        )}</b><small>${esc(
          s.address || "Alamat belum ditambahkan"
        )}</small><span class="store-card-count">${
          s.available_products_count
        } menu tersedia <i>›</i></span></span></button>`
    )
    .join("");
}
async function openStore(id) {
  selectedStore = stores.find((s) => s.id === id) || null;
  if (!selectedStore) return;
  document.getElementById("home-page").classList.add("store-open");
  document.getElementById("store-directory-head").hidden = true;
  document.getElementById("store-detail-view").hidden = false;
  document.getElementById("selected-store-name").textContent =
    selectedStore.name;
  document.getElementById("selected-store-address").textContent =
    selectedStore.address || "";
  document.getElementById("selected-store-rating").textContent =
    selectedStore.rating == null
      ? "–"
      : Number(selectedStore.rating).toLocaleString("id-ID", {
          maximumFractionDigits: 1,
        });
  renderCartCount();
  const cover = document.getElementById("store-profile-image");
  cover.innerHTML = selectedStore.cover_image
    ? `<img src="${esc(selectedStore.cover_image)}" alt="Foto toko ${esc(
        selectedStore.name
      )}">`
    : "";
  await loadProducts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function backToStores() {
  selectedStore = null;
  document.getElementById("home-page").classList.remove("store-open");
  document.getElementById("store-directory-head").hidden = false;
  document.getElementById("store-detail-view").hidden = true;
  loadStores();
}
async function loadProducts() {
  if (!selectedStore) {
    loadStores();
    return;
  }
  let url =
    "/api/products?" +
    new URLSearchParams({
      store_id: selectedStore.id,
      category,
      q: document.getElementById("search").value.trim(),
    });
  try {
    catalog = await api(url);
    renderProducts();
  } catch (e) {
    document.getElementById("products").innerHTML =
      '<div class="loading">Belum dapat memuat menu toko ini.</div>';
  }
}
function renderProducts() {
  const grid = document.getElementById("products");
  if (!catalog.length) {
    grid.innerHTML =
      '<p class="store-empty-menu">Belum ada menu yang diunggah oleh toko ini.</p>';
    return;
  }
  grid.innerHTML = catalog
    .map(
      (p) =>
        `<article class="store-menu-row"><div class="store-menu-photo">${
          p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : ""
        }</div><div class="store-menu-copy"><h2>${esc(p.name)}</h2><p>${esc(
          p.description || ""
        )}</p><small>Berlaku sampai : ${String(p.safe_until || "").slice(
          0,
          5
        )}</small></div><b class="store-menu-price">${rupiah(
          p.sale_price
        )}</b><button class="store-menu-add" onclick="addToCart(${
          p.id
        })" aria-label="Tambah ${esc(
          p.name
        )}"><span>+</span></button></article>`
    )
    .join("");
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}
function persistCart() {
  sessionStorage.setItem("stillgood-cart-v2", JSON.stringify(cart));
  renderCartCount();
}
function addToCart(id) {
  if (!requireBuyer("menambahkan makanan ke keranjang")) return;
  const p = catalog.find((x) => x.id === id);
  if (!p) return;
  if (Object.values(cart).some((x) => x.store_id !== p.store_id)) {
    toast("Selesaikan checkout toko saat ini sebelum memilih toko lain.");
    return;
  }
  cart[id] ??= {
    id: p.id,
    name: p.name,
    image: p.image,
    price: p.sale_price,
    stock: p.stock,
    store_id: p.store_id,
    qty: 0,
  };
  if (cart[id].qty >= p.stock) {
    toast("Stok menu ini sudah habis.");
    return;
  }
  cart[id].qty++;
  persistCart();
  toast(p.name + " masuk ke keranjang!");
}
function changeQty(id, delta) {
  if (!cart[id]) return;
  cart[id].qty = Math.min(cart[id].stock, cart[id].qty + delta);
  if (cart[id].qty <= 0) delete cart[id];
  persistCart();
  renderCart();
}
function cartTotal() {
  return Object.values(cart).reduce((a, x) => a + x.price * x.qty, 0);
}
function cartCount() {
  return Object.values(cart).reduce((a, x) => a + x.qty, 0);
}
function renderCartCount() {
  const n = currentUser && currentUser.role === "buyer" ? cartCount() : 0,
    total = currentUser && currentUser.role === "buyer" ? cartTotal() : 0;
  document.getElementById("cart-fab-count").textContent =
    n + " makanan dipilih";
  document.getElementById("cart-total").textContent = n
    ? rupiah(total) + " · total belanja"
    : "Lihat menu toko";
  document.getElementById("cart-fab").style.display =
    n && selectedStore ? "flex" : "none";
}
function openCart() {
  if (!requireBuyer("membuka keranjang")) return;
  renderCart();
  openModal("cart-modal");
}
function renderCart() {
  const lines = document.getElementById("cart-lines");
  if (!cartCount())
    lines.innerHTML =
      '<p class="empty-cart">Keranjangmu masih kosong. Yuk temukan menu baik hari ini.</p>';
  else
    lines.innerHTML = Object.values(cart)
      .map(
        (x) =>
          `<div class="cart-line"><img src="${esc(
            x.image || "/assets/still-good-mark.png"
          )}"><div class="cart-line-info"><b>${esc(x.name)}</b><small>${rupiah(
            x.price
          )} / porsi</small></div><div class="qty-control"><button onclick="changeQty(${
            x.id
          },-1)">−</button><b>${x.qty}</b><button onclick="changeQty(${
            x.id
          },1)">+</button></div></div>`
      )
      .join("");
  document.getElementById("checkout-total").textContent = rupiah(cartTotal());
  document.getElementById("pay-total").textContent = rupiah(cartTotal());
}
function openCheckout() {
  if (!requireBuyer("melanjutkan checkout") || !cartCount()) return;
  closeModal("cart-modal");
  document.getElementById("pay-total").textContent = rupiah(cartTotal());
  openModal("checkout-modal");
}
async function placeOrder() {
  if (!requireBuyer("membuat pesanan")) return;
  const name = document.getElementById("buyer-name").value.trim(),
    phone = document.getElementById("buyer-phone").value.trim();
  if (!name || !phone) {
    toast("Isi nama dan nomor WhatsApp dulu, ya.");
    return;
  }
  const button = document.querySelector("#checkout-modal .primary-btn");
  button.disabled = true;
  try {
    lastOrder = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        buyer_name: name,
        buyer_phone: phone,
        pickup_method: pickup,
        payment_method: payment,
        items: Object.values(cart).map((x) => ({ id: x.id, qty: x.qty })),
      }),
    });
    cart = {};
    persistCart();
    closeModal("checkout-modal");
    if (lastOrder.payment_redirect_url) {
      window.location.assign(lastOrder.payment_redirect_url);
      return;
    }
    showOrderSummary(lastOrder);
    toast(
      lastOrder.payment_mode === "cash"
        ? "Pesanan dibuat · bayar tunai saat pengambilan"
        : lastOrder.payment_mode === "mock"
        ? "Mode pembayaran demo aktif · " + payment
        : "Pembayaran berhasil · " + payment
    );
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
}
function startCancelTimer(order) {
  clearInterval(timerHandle);
  let remain = Math.max(
    0,
    Math.ceil((new Date(order.cancel_until) - Date.now()) / 1000)
  );
  const update = () => {
    document.getElementById("cancel-timer").textContent =
      "00:" + String(Math.max(remain, 0)).padStart(2, "0");
    document.getElementById("cancel-order").disabled = remain <= 0;
    if (remain <= 0) {
      clearInterval(timerHandle);
      document.getElementById("cancel-order").textContent =
        "Waktu pembatalan berakhir";
    }
    remain--;
  };
  update();
  timerHandle = setInterval(update, 1000);
}
async function cancelOrder() {
  if (!lastOrder) return;
  try {
    await api(`/api/orders/${lastOrder.id}/cancel`, {
      method: "POST",
      body: "{}",
    });
    closeModal("success-modal");
    toast("Pesanan dibatalkan. Stok dikembalikan.");
    loadProducts();
    loadOrders();
  } catch (e) {
    toast(e.message);
  }
}

let summaryOrder = null,
  summaryTimer = null,
  summaryPoll = null,
  ordersCache = [];
const SUMMARY_STEP = {
  "Menunggu Konfirmasi": 0,
  Diproses: 1,
  "Siap Diambil": 2,
  Selesai: 3,
};
const ACTIVE_STATUS = ["Menunggu Konfirmasi", "Diproses", "Siap Diambil"];
function isFinalStatus(st) {
  return (
    st === "Selesai" || st === "Ditolak" || String(st).startsWith("Dibatalkan")
  );
}
function isCancelledStatus(st) {
  return (
    st === "Ditolak" ||
    st === "Pembatalan Diproses" ||
    String(st).startsWith("Dibatalkan")
  );
}
function renderSummarySteps(status) {
  const idx = SUMMARY_STEP[status];
  document.querySelectorAll("#summary-steps li").forEach((li, i) => {
    li.classList.toggle(
      "done",
      idx !== undefined && (i < idx || status === "Selesai")
    );
    li.classList.toggle(
      "current",
      idx !== undefined && i === idx && status !== "Selesai"
    );
  });
}
function summaryHint(status, cash) {
  if (isCancelledStatus(status))
    return "Pesanan ini dibatalkan. Stok sudah dikembalikan.";
  if (status === "Menunggu Konfirmasi")
    return "Menunggu penjual mengonfirmasi pesananmu. Simpan kode unik di bawah.";
  if (status === "Diproses") return "Penjual sedang menyiapkan pesananmu.";
  if (status === "Siap Diambil")
    return cash
      ? "Pesananmu siap diambil! Tunjukkan kode unik dan bayar tunai langsung ke penjual."
      : "Pesananmu siap diambil! Tunjukkan kode unik ini kepada penjual.";
  if (status === "Selesai")
    return "Pesanan selesai. Terima kasih sudah menyelamatkan makanan!";
  return "Tunjukkan kode unik ini kepada penjual saat mengambil pesanan.";
}
function renderSummaryPay(o) {
  const cash = o.payment_method === "Tunai";
  document.getElementById("summary-pay").innerHTML = cash
    ? o.payment_status === "PAID"
      ? `<b>Metode: Tunai</b> · Lunas, pembayaran sudah diterima penjual.`
      : isCancelledStatus(o.status)
      ? `<b>Metode: Tunai</b> · Tidak ada pembayaran yang diproses.`
      : `<b>Metode: Tunai</b> · Belum dibayar. Siapkan <b>${rupiah(
          o.total
        )}</b> dan bayar langsung ke penjual saat mengambil pesanan.`
    : `<b>Metode: QRIS</b> · ${
        o.payment_status === "REFUNDED"
          ? "Dana dikembalikan."
          : "Pembayaran diterima."
      }`;
}
function renderSummaryState(o) {
  const cash = o.payment_method === "Tunai";
  renderSummarySteps(o.status);
  renderSummaryPay(o);
  document.getElementById("summary-hint").textContent = summaryHint(
    o.status,
    cash
  );
  const btn = document.getElementById("summary-cancel"),
    label = document.getElementById("summary-timer");
  if (o.status !== "Menunggu Konfirmasi") {
    clearInterval(summaryTimer);
    btn.hidden = true;
    label.hidden = true;
  }
}
function showOrderSummary(o, opts = {}) {
  summaryOrder = { ...o };
  document.getElementById("summary-no").textContent = "Pesanan #" + o.id;
  document.getElementById("summary-total").textContent = rupiah(o.total);
  document.getElementById("summary-code").textContent = o.pickup_pin;
  document.getElementById("summary-items").innerHTML = (o.items || [])
    .map(
      (i) =>
        `<div class="summary-line"><span>${esc(
          i.product_name_snapshot || i.product?.name || "Menu"
        )} x${i.quantity}</span><span>${Number(
          i.unit_price * i.quantity
        ).toLocaleString("id-ID")}</span></div>`
    )
    .join("");
  startSummaryTimer(o);
  renderSummaryState(summaryOrder);
  openModal("summary-modal");
  clearInterval(summaryPoll);
  summaryPoll = setInterval(refreshSummary, 4000);
  if (!opts.skipReload) loadProducts();
}
function startSummaryTimer(o) {
  clearInterval(summaryTimer);
  const btn = document.getElementById("summary-cancel"),
    label = document.getElementById("summary-timer");
  btn.hidden = false;
  label.hidden = false;
  let remain = Math.max(
    0,
    Math.ceil((new Date(o.cancel_until) - Date.now()) / 1000)
  );
  const tick = () => {
    const r = Math.max(remain, 0);
    label.textContent =
      Math.floor(r / 60) + ":" + String(r % 60).padStart(2, "0");
    if (remain <= 0) {
      clearInterval(summaryTimer);
      btn.hidden = true;
      label.hidden = true;
    }
    remain--;
  };
  tick();
  summaryTimer = setInterval(tick, 1000);
}
async function refreshSummary() {
  const modal = document.getElementById("summary-modal");
  if (!summaryOrder || !modal.classList.contains("show")) {
    clearInterval(summaryPoll);
    return;
  }
  try {
    const d = await api("/api/payments/status/" + summaryOrder.id);
    summaryOrder.status = d.status;
    summaryOrder.payment_status = d.payment_status;
    renderSummaryState(summaryOrder);
    if (isFinalStatus(d.status) || d.status === "Pembatalan Diproses")
      clearInterval(summaryPoll);
    if (document.getElementById("history-page").classList.contains("active"))
      loadOrders(true);
  } catch (e) {}
}
function closeSummary() {
  clearInterval(summaryTimer);
  clearInterval(summaryPoll);
  closeModal("summary-modal");
}
async function cancelFromSummary() {
  if (!summaryOrder) return;
  try {
    await api(`/api/orders/${summaryOrder.id}/cancel`, {
      method: "POST",
      body: "{}",
    });
    closeSummary();
    toast("Pesanan dibatalkan. Stok dikembalikan.");
    loadProducts();
    loadOrders();
  } catch (e) {
    toast(e.message);
  }
}
function openOrderNota(id) {
  const o = ordersCache.find((x) => x.id === id);
  if (o) showOrderSummary(o, { skipReload: true });
}
function setHistoryIntro(seller) {
  const pg = document.getElementById("history-page"),
    e = pg.querySelector(".eyebrow"),
    h = pg.querySelector("h1"),
    t = pg.querySelector(".page-intro p");
  if (!pg.dataset.orig)
    pg.dataset.orig = JSON.stringify([
      e.textContent,
      h.innerHTML,
      t.textContent,
    ]);
  const o = JSON.parse(pg.dataset.orig);
  if (seller) {
    e.textContent = "CATATAN PENJUALAN";
    h.innerHTML = "Riwayat <span>penjualan</span>";
    t.textContent =
      "Pesanan yang sudah selesai atau dibatalkan. Pesanan yang sedang berjalan ada di menu Pesanan masuk.";
  } else {
    e.textContent = o[0];
    h.innerHTML = o[1];
    t.textContent = o[2];
  }
}
async function loadOrders(silent) {
  if (currentUser?.role === "seller") return loadSellerHistory(silent);
  setHistoryIntro(false);
  const list = document.getElementById("order-list");
  if (!silent)
    list.innerHTML = '<div class="loading">Memuat riwayat pesanan…</div>';
  try {
    const orders = await api("/api/orders");
    ordersCache = orders;
    if (!orders.length) {
      list.innerHTML =
        '<div class="loading">Belum ada pesanan. Makanan baikmu menunggu.</div>';
      return;
    }
    list.innerHTML = orders
      .map((o) => {
        const names = o.items
          .map(
            (i) =>
              `${i.product?.name || i.product_name_snapshot || "Menu"} × ${
                i.quantity
              }`
          )
          .join(", ");
        const img = o.items[0]?.product?.image || "/assets/still-good-mark.png";
        const canCancel =
          o.status === "Menunggu Konfirmasi" &&
          new Date(o.cancel_until) > Date.now();
        const active = ACTIVE_STATUS.includes(o.status);
        const unpaidCash =
          o.payment_method === "Tunai" && o.payment_status !== "PAID" && active;
        return `<article class="order-card"><img class="order-thumb" src="${esc(
          img
        )}"><div class="order-info"><b>${esc(names)}</b><small>${new Date(
          o.created_at
        ).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        })} · ${
          o.pickup_method === "pickup" ? "Ambil sendiri" : "GoSend"
        }</small><span>${rupiah(o.total)} · ${esc(o.payment_method)}${
          unpaidCash ? " · bayar saat pengambilan" : ""
        }</span>${
          active
            ? `<span class="order-code">Kode unik <b>${esc(
                o.pickup_pin
              )}</b></span>`
            : ""
        }<span class="status-pill">${esc(
          o.status
        )}</span></div><div class="order-actions">${
          canCancel
            ? `<button onclick="cancelAny(${o.id})">Batalkan</button>`
            : ""
        }<button onclick="openOrderNota(${o.id})">Lihat nota</button>${
          o.status === "Selesai"
            ? `<button onclick="rateOrder(${o.id})">Beri ulasan ★</button>`
            : ""
        }</div></article>`;
      })
      .join("");
  } catch (e) {
    if (!silent)
      list.innerHTML = `<div class="loading">${esc(e.message)}</div>`;
  }
}
async function loadSellerHistory(silent) {
  setHistoryIntro(true);
  const list = document.getElementById("order-list");
  if (!silent)
    list.innerHTML = '<div class="loading">Memuat riwayat penjualan…</div>';
  try {
    const orders = (await api("/api/orders"))
      .filter((o) => isFinalStatus(o.status))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    if (!orders.length) {
      list.innerHTML =
        '<div class="loading">Belum ada pesanan selesai atau dibatalkan. Pesanan yang sedang berjalan ada di menu Pesanan masuk.</div>';
      return;
    }
    const done = orders.filter((o) => o.status === "Selesai");
    const income = done.reduce((n, o) => n + o.total, 0);
    list.innerHTML =
      `<div class="history-summary"><span>Pesanan selesai <b>${
        done.length
      }</b></span><span>Total pendapatan <b>${rupiah(
        income
      )}</b></span></div>` +
      orders
        .map((o) => {
          const names = o.items
            .map(
              (i) =>
                `${i.product?.name || i.product_name_snapshot || "Menu"} × ${
                  i.quantity
                }`
            )
            .join(", ");
          const img =
            o.items[0]?.product?.image || "/assets/still-good-mark.png";
          const paid =
            o.status === "Selesai" ? "Lunas" : "Tidak ada pembayaran masuk";
          return `<article class="order-card"><img class="order-thumb" src="${esc(
            img
          )}"><div class="order-info"><b>#${o.id} · ${esc(
            o.buyer_name
          )}</b><small>${esc(names)}</small><small>${new Date(
            o.updated_at
          ).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })} · ${
            o.pickup_method === "pickup" ? "Ambil sendiri" : "GoSend"
          } · ${esc(o.buyer_phone)}</small><span>${rupiah(o.total)} · ${esc(
            o.payment_method
          )} · ${paid}</span><span class="status-pill">${esc(
            o.status
          )}</span></div></article>`;
        })
        .join("");
  } catch (e) {
    if (!silent)
      list.innerHTML = `<div class="loading">${esc(e.message)}</div>`;
  }
}
let incomingOrders = [],
  knownIncoming = null,
  verifyOrderId = null;
function syncRoleNav() {
  const seller = currentUser?.role === "seller",
    b = document.querySelector('.nav-link[data-page="orders"]');
  if (b) b.hidden = !seller;
  if (seller) {
    knownIncoming = null;
    incomingTick();
  }
}
function updateIncomingBadge() {
  const n = incomingOrders.filter(
      (o) => o.status === "Menunggu Konfirmasi"
    ).length,
    el = document.getElementById("incoming-badge");
  if (el) {
    el.textContent = n;
    el.hidden = !n;
  }
}
async function incomingTick() {
  if (currentUser?.role !== "seller") return;
  try {
    incomingOrders = await api("/api/seller/orders");
    const ids = new Set(
      incomingOrders
        .filter((o) => o.status === "Menunggu Konfirmasi")
        .map((o) => o.id)
    );
    if (knownIncoming && [...ids].some((id) => !knownIncoming.has(id)))
      toast("Pesanan baru masuk! Segera konfirmasi.");
    knownIncoming = ids;
    updateIncomingBadge();
    if (document.getElementById("orders-page")?.classList.contains("active"))
      renderIncoming();
  } catch (e) {}
}
async function loadIncoming() {
  const l = document.getElementById("incoming-list");
  if (!incomingOrders.length)
    l.innerHTML = '<div class="loading">Memuat pesanan masuk…</div>';
  await incomingTick();
  renderIncoming();
}
function incomingCard(o) {
  const names = o.items
    .map(
      (i) =>
        `${i.product?.name || i.product_name_snapshot || "Menu"} × ${
          i.quantity
        }`
    )
    .join(", ");
  const img = o.items[0]?.product?.image || "/assets/still-good-mark.png";
  const cash = o.payment_method === "Tunai";
  const payTxt = cash
    ? o.payment_status === "PAID"
      ? "Tunai · Lunas"
      : "Tunai · terima " + rupiah(o.total) + " saat pengambilan"
    : "QRIS · Lunas";
  let actions = "";
  if (o.status === "Menunggu Konfirmasi")
    actions = `<button class="inc-primary" onclick="sellerAction(${o.id},'Diproses')">Konfirmasi</button><button class="inc-danger" onclick="sellerAction(${o.id},'Ditolak')">Tolak</button>`;
  else if (o.status === "Diproses")
    actions = `<button class="inc-primary" onclick="sellerAction(${o.id},'Siap Diambil')">Siap diambil</button>`;
  else if (o.status === "Siap Diambil")
    actions = `<button class="inc-primary" onclick="openVerify(${o.id})">Verifikasi kode &amp; selesai</button>`;
  return `<article class="order-card incoming-card"><img class="order-thumb" src="${esc(
    img
  )}"><div class="order-info"><b>#${o.id} · ${esc(
    o.buyer_name
  )}</b><small>${esc(names)}</small><small>${esc(o.buyer_phone)} · ${
    o.pickup_method === "pickup" ? "Ambil sendiri" : "GoSend"
  } · ${new Date(o.created_at).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })}</small><span>${rupiah(o.total)} · ${esc(
    payTxt
  )}</span><span class="status-pill">${esc(o.status)}</span>${
    o.status === "Menunggu Konfirmasi" && o.seller_deadline
      ? `<span class="deadline" data-deadline="${esc(
          o.seller_deadline
        )}"></span>`
      : ""
  }</div><div class="order-actions incoming-actions">${actions}</div></article>`;
}
function renderIncoming() {
  const l = document.getElementById("incoming-list");
  if (!l) return;
  const groups = [
    ["Perlu konfirmasi", "Menunggu Konfirmasi"],
    ["Sedang diproses", "Diproses"],
    ["Siap diambil pembeli", "Siap Diambil"],
  ];
  const html = groups
    .map(([title, st]) => {
      const rows = incomingOrders
        .filter((o) => o.status === st)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return rows.length
        ? `<h3 class="incoming-group">${title} <span>${
            rows.length
          }</span></h3>${rows.map(incomingCard).join("")}`
        : "";
    })
    .join("");
  l.innerHTML =
    html ||
    '<div class="loading">Belum ada pesanan masuk. Pesanan baru akan muncul otomatis di sini.</div>';
  tickDeadlines();
}
function tickDeadlines() {
  document.querySelectorAll(".deadline[data-deadline]").forEach((el) => {
    const r = Math.floor((new Date(el.dataset.deadline) - Date.now()) / 1000);
    el.textContent =
      r > 0
        ? `Konfirmasi sebelum ${Math.floor(r / 60)}:${String(r % 60).padStart(
            2,
            "0"
          )}`
        : "Batas konfirmasi berakhir";
  });
}
async function sellerAction(id, status) {
  if (
    status === "Ditolak" &&
    !confirm("Tolak pesanan ini? Stok akan dikembalikan ke menu.")
  )
    return;
  try {
    await api(`/api/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    toast(
      status === "Ditolak"
        ? "Pesanan ditolak."
        : "Status pesanan diperbarui. Pembeli ikut melihat perubahannya."
    );
  } catch (e) {
    toast(e.message);
  }
  await incomingTick();
}
function openVerify(id) {
  const o = incomingOrders.find((x) => x.id === id);
  if (!o) return;
  verifyOrderId = id;
  const cash = o.payment_method === "Tunai" && o.payment_status !== "PAID";
  document.getElementById("verify-info").textContent =
    `Pesanan #${o.id} · ${o.buyer_name} · ${rupiah(o.total)}.` +
    (cash
      ? ` Terima uang tunai ${rupiah(
          o.total
        )} dari pembeli, lalu masukkan kode unik.`
      : " Minta kode unik dari pembeli.");
  document.getElementById("verify-code").value = "";
  openModal("verify-modal");
  setTimeout(() => document.getElementById("verify-code").focus(), 50);
}
document.getElementById("verify-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = document.getElementById("verify-code").value.trim();
  try {
    await api(`/api/orders/${verifyOrderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "Selesai", pickup_pin: pin }),
    });
    closeModal("verify-modal");
    toast("Pesanan selesai. Terima kasih!");
    await incomingTick();
  } catch (err) {
    toast(err.message);
  }
});
window.setInterval(() => {
  if (!currentUser) return;
  if (document.getElementById("history-page")?.classList.contains("active"))
    loadOrders(true);
  incomingTick();
}, 5000);
window.setInterval(tickDeadlines, 1000);

async function cancelAny(id) {
  try {
    await api(`/api/orders/${id}/cancel`, { method: "POST", body: "{}" });
    toast("Pesanan dibatalkan dan stok kembali.");
    loadOrders();
    loadProducts();
  } catch (e) {
    toast(e.message);
  }
}
function showPin(id) {
  toast("Tunjukkan PIN di riwayat kepada mitra saat mengambil pesanan.");
}
async function rateOrder(id) {
  const rating = Number(prompt("Beri rating 1–5 untuk toko ini:", "5"));
  if (!rating || rating < 1 || rating > 5) return;
  const comment = prompt(
    "Tulis ulasan singkat (opsional):",
    "Makanannya enak!"
  );
  try {
    await api("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ order_id: id, rating, comment }),
    });
    toast("Terima kasih atas ulasan baikmu!");
  } catch (e) {
    toast(e.message);
  }
}
function renderSellerHomeMenus(products) {
  const list = document.getElementById("seller-home-menu-list");
  if (!products.length) {
    list.innerHTML =
      '<p class="seller-home-empty">Belum ada menu di toko ini.</p>';
    return;
  }
  list.innerHTML = products
    .map(
      (p) =>
        `<article class="seller-home-menu-row"><div class="seller-home-menu-photo">${
          p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : ""
        }</div><div class="seller-home-menu-copy"><h2>${esc(
          p.name
        )}</h2><p>${esc(p.description || "")}</p><small>Aman sampai ${String(
          p.safe_until || ""
        ).slice(0, 5)} · ${
          p.stock
        } porsi</small></div><b class="seller-home-menu-price">${rupiah(
          p.sale_price
        )}</b><button class="seller-home-menu-edit" type="button" onclick="editProduct(${
          p.id
        })" aria-label="Edit ${esc(
          p.name
        )}"><span aria-hidden="true">✎</span></button></article>`
    )
    .join("");
}
async function loadSeller() {
  const productList = document.getElementById("seller-products"),
    orderList = document.getElementById("seller-order-list");
  if (!productList.dataset.loaded)
    productList.innerHTML = '<p class="loading">Memuat menu toko…</p>';
  try {
    catalog = await api("/api/seller/products");
    renderSellerHomeMenus(catalog);
    productList.dataset.loaded = "1";
    productList.innerHTML = catalog.length
      ? catalog
          .map(
            (p) =>
              `<article class="seller-product"><div class="seller-product-photo">${
                p.image
                  ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">`
                  : ""
              }</div><div><b>${esc(p.name)}</b><small>${
                p.stock
              } porsi · ${rupiah(
                p.sale_price
              )}</small></div><button onclick="editProduct(${
                p.id
              })">Ubah</button><button onclick="adjustStock(${
                p.id
              })">Stok</button></article>`
          )
          .join("")
      : '<p class="loading">Belum ada menu di toko ini. Tambahkan menu pertama untuk mulai menjual.</p>';
  } catch (e) {
    catalog = [];
    const message = `Menu toko gagal dimuat. ${esc(e.message)}`;
    document.getElementById(
      "seller-home-menu-list"
    ).innerHTML = `<p class="seller-home-empty">${message}</p>`;
    productList.innerHTML = `<p class="loading">${message}</p>`;
    return;
  }
  try {
    const orders = await api("/api/seller/orders"),
      pending = orders.filter((o) => o.status === "Menunggu Konfirmasi"),
      completed = orders.filter((o) => o.status === "Selesai"),
      completedToday = completed.filter(
        (o) =>
          new Date(o.updated_at).toDateString() === new Date().toDateString()
      );
    document.getElementById("seller-orders").textContent = pending.length;
    document.getElementById("seller-revenue").textContent = rupiah(
      completedToday.reduce((n, o) => n + o.total, 0)
    );
    document.getElementById("seller-portions").textContent = completed.reduce(
      (n, o) => n + o.items.reduce((a, i) => a + i.quantity, 0),
      0
    );
    orderList.innerHTML = orders.length
      ? orders
          .map(
            (o) =>
              `<div class="order-card"><div class="order-info"><b>#${
                o.id
              } · ${esc(o.buyer_name)} · ${rupiah(o.total)}</b><small>${o.items
                .map((i) => `${i.product?.name || "Menu"} × ${i.quantity}`)
                .join(", ")} · ${esc(
                o.buyer_phone
              )}</small><span class="status-pill">${esc(o.status)} · ${
                o.payment_method
              }</span></div><div class="order-actions">${
                o.status === "Menunggu Konfirmasi"
                  ? `<button onclick="updateStatus(${o.id},'Diproses')">Konfirmasi</button><button onclick="updateStatus(${o.id},'Ditolak')">Tolak</button>`
                  : ""
              }${
                o.status === "Diproses"
                  ? `<button onclick="updateStatus(${o.id},'Siap Diambil')">Siap diambil</button>`
                  : ""
              }${
                o.status === "Siap Diambil"
                  ? `<button onclick="verifyPickup(${o.id})">Verifikasi PIN</button>`
                  : ""
              }</div></div>`
          )
          .join("")
      : '<p class="loading">Belum ada pesanan masuk.</p>';
  } catch (e) {
    orderList.innerHTML = `<p class="loading">Menu berhasil dimuat. Pesanan gagal dimuat: ${esc(
      e.message
    )}</p>`;
  }
}
async function updateStatus(id, status, pin = "") {
  try {
    await api(`/api/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, pickup_pin: pin }),
    });
    toast(
      status === "Ditolak"
        ? "Pesanan ditolak. Proses refund mengikuti metode pembayaran."
        : "Status pesanan diperbarui."
    );
    loadSeller();
    loadOrders();
  } catch (e) {
    toast(e.message);
  }
}
function verifyPickup(id) {
  const pin = prompt("Masukkan PIN enam digit dari pembeli:");
  if (pin) updateStatus(id, "Selesai", pin);
}
function adjustStock(id) {
  const p = catalog.find((x) => x.id === id);
  const n = Number(prompt("Atur stok tersedia:", p?.stock || 0));
  if (Number.isNaN(n) || n < 0) return;
  const item = catalog.find((x) => x.id === id);
  if (item) item.stock = n;
  const form = new FormData();
  const source = catalog.find((x) => x.id === id);
  if (!source) return;
  [
    "name",
    "category",
    "description",
    "stock",
    "original_price",
    "sale_price",
    "safe_until",
    "pickup_from",
    "pickup_until",
  ].forEach((k) =>
    form.append(
      k,
      String(source[k]).includes(":")
        ? String(source[k]).slice(0, 5)
        : source[k]
    )
  );
  form.set("stock", n);
  form.append("_method", "PATCH");
  api(`/api/seller/products/${id}`, { method: "POST", body: form })
    .then(() => {
      toast("Stok diperbarui.");
      loadProducts();
      loadSeller();
    })
    .catch((e) => toast(e.message));
}
async function loadAdmin() {
  try {
    const rows = await api("/api/admin/categories");
    document.getElementById("category-list").innerHTML = rows
      .map(
        (c) =>
          `<div class="seller-product"><div><b>${esc(c.name)}</b><small>${
            c.active ? "Aktif di katalog" : "Disembunyikan"
          }</small></div><button onclick="toggleCategory(${c.id},'${esc(
            c.name
          )}',${!c.active})">${
            c.active ? "Sembunyikan" : "Aktifkan"
          }</button><button onclick="removeCategory(${
            c.id
          })">Hapus</button></div>`
      )
      .join("");
  } catch (e) {
    toast(e.message);
  }
}
async function toggleCategory(id, name, active) {
  try {
    await api(`/api/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, active }),
    });
    loadAdmin();
    loadPublicCategories();
  } catch (e) {
    toast(e.message);
  }
}
async function removeCategory(id) {
  try {
    await api(`/api/admin/categories/${id}`, { method: "DELETE" });
    loadAdmin();
    loadPublicCategories();
  } catch (e) {
    toast(e.message);
  }
}
function openNewProduct() {
  const f = document.getElementById("product-form");
  f.reset();
  f.elements.id.value = "";
  f.elements.image.required = true;
  document.querySelector("#product-modal h2").innerHTML =
    "Tambah <span>menu.</span>";
  openModal("product-modal");
}
function editProduct(id) {
  const p = catalog.find((x) => x.id === id);
  if (!p) return;
  const f = document.getElementById("product-form");
  f.reset();
  f.elements.id.value = id;
  f.elements.image.required = false;
  document.querySelector("#product-modal h2").innerHTML =
    "Edit <span>menu.</span>";
  Object.entries(p).forEach(([k, v]) => {
    if (f.elements[k] && k !== "image")
      f.elements[k].value = String(v).includes(":") ? String(v).slice(0, 5) : v;
  });
  openModal("product-modal");
}
document
  .getElementById("product-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      id = f.elements.id.value;
    const data = new FormData(f);
    if (id) data.append("_method", "PATCH");
    try {
      await api(id ? `/api/seller/products/${id}` : "/api/seller/products", {
        method: "POST",
        body: data,
      });
      closeModal("product-modal");
      f.reset();
      f.elements.image.required = true;
      toast("Menu berhasil diterbitkan.");
      loadProducts();
      loadSeller();
    } catch (err) {
      toast(err.message);
    }
  });
document.getElementById("category-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    e.currentTarget.reset();
    loadAdmin();
    toast("Kategori ditambahkan.");
  } catch (err) {
    toast(err.message);
  }
};
function updateImpact() {
  api("/api/orders")
    .then((orders) => {
      const completed = orders.filter((o) => o.status === "Selesai"),
        portions = completed.reduce(
          (n, o) => n + o.items.reduce((a, i) => a + i.quantity, 0),
          0
        ),
        saved = completed.reduce(
          (n, o) =>
            n +
            o.items.reduce(
              (a, i) =>
                a +
                (i.product
                  ? Math.max(0, i.product.original_price - i.unit_price) *
                    i.quantity
                  : 0),
              0
            ),
          0
        );
      document.getElementById("saved-count").textContent = portions;
      document.getElementById("impact-total").innerHTML =
        portions + " <small>porsi</small>";
      document.getElementById("carbon-count").innerHTML =
        (portions * 0.3).toFixed(1) + " <small>kg</small>";
      document.getElementById("impact-carbon").textContent =
        (portions * 0.3).toFixed(1) + " kg";
      document.getElementById("impact-savings").textContent = rupiah(saved);
      document.getElementById("impact-days").textContent =
        new Set(
          completed.map((o) =>
            new Date(o.updated_at).toISOString().slice(0, 10)
          )
        ).size + " hari";
    })
    .catch(() => {
      document.getElementById("saved-count").textContent = "0";
      document.getElementById("impact-total").innerHTML =
        "0 <small>porsi</small>";
      document.getElementById("carbon-count").innerHTML =
        "0.0 <small>kg</small>";
      document.getElementById("impact-carbon").textContent = "0.0 kg";
      document.getElementById("impact-savings").textContent = "Rp 0";
      document.getElementById("impact-days").textContent = "0 hari";
    });
}
document
  .querySelectorAll(".nav-link")
  .forEach((b) => (b.onclick = () => showPage(b.dataset.page)));
document
  .querySelectorAll(".chip")
  .forEach((b) => (b.onclick = () => setCategoryFilter(b)));
document.getElementById("search").addEventListener("input", () => {
  clearTimeout(window.searchDelay);
  window.searchDelay = setTimeout(() => {
    if (selectedStore) backToStores();
    else loadStores();
  }, 220);
});
document.getElementById("locate").onclick = () => {
  if (!navigator.geolocation) {
    toast("Browser ini belum mendukung lokasi.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      nearLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById("location-label").textContent = "Lokasi terdekat";
      toast("Lokasi ditemukan. Menu terdekat ditampilkan.");
      loadProducts();
    },
    () =>
      toast("Izin lokasi belum diberikan. Coba atur izin lokasi lalu ulangi.")
  );
};
document.getElementById("nearby").onchange = (e) => {
  if (e.target.checked) document.getElementById("locate").click();
  else {
    nearLocation = null;
    loadProducts();
  }
};
document.getElementById("sort").onclick = () => {
  if (selectedStore) {
    catalog.reverse();
    renderProducts();
  } else {
    stores.reverse();
    renderStores();
  }
  toast("Urutan diperbarui.");
};
document.querySelectorAll("[data-pickup]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-pickup]")
        .forEach((c) => c.classList.remove("active"));
      b.classList.add("active");
      pickup = b.dataset.pickup;
    })
);
payment = "QRIS";
document.querySelectorAll("[data-pay]").forEach((b) => {
  const choose = () => {
    payment = b.dataset.pay;
    document
      .querySelectorAll("[data-pay]")
      .forEach((c) => c.classList.toggle("active", c.dataset.pay === payment));
    const btn = document.querySelector("#checkout-modal .primary-btn");
    if (btn && btn.firstChild)
      btn.firstChild.nodeValue = payment === "Tunai" ? "Pesan " : "Bayar ";
    const note = document.getElementById("checkout-note");
    if (note) {
      if (note.dataset.prev === undefined) note.dataset.prev = note.textContent;
      note.textContent =
        payment === "Tunai"
          ? "Bayar tunai langsung ke penjual saat mengambil pesanan. Pesananmu masuk ke toko selama 5 menit."
          : note.dataset.prev;
    }
  };
  b.onclick = choose;
  b.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose();
    }
  };
});
document.querySelectorAll(".modal-backdrop").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m) closeModal(m.id);
  })
);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("search").focus();
  }
  if (e.key === "Escape")
    document
      .querySelectorAll(".modal-backdrop.show")
      .forEach((m) => closeModal(m.id));
});
document.getElementById("cart-fab").style.display = "none";
renderCartCount();
api("/api/config")
  .then((config) => {
    document.querySelectorAll(".secure-note").forEach((note) => {
      note.textContent =
        config.payment_mode === "mock"
          ? "Mode demo QRIS · tidak ada transaksi uang sungguhan"
          : "Pembayaran QRIS diproses melalui Midtrans";
    });
  })
  .catch(() => {});
showLogin();
api("/api/me")
  .then((me) => {
    if (me?.id) accountReady(me);
  })
  .catch(() => {});
loadPublicCategories();
loadProducts();

window.setInterval(() => {
  if (
    currentUser?.role === "seller" &&
    document.getElementById("seller-page")?.classList.contains("active")
  )
    loadSeller();
}, 15000);
