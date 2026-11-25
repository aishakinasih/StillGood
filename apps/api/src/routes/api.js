import { Router } from "express";

import multer from "multer";

import bcrypt from "bcryptjs";

import crypto from "node:crypto";

import { prisma } from "../lib/prisma.js";

import { asyncRoute, HttpError, requireValue } from "../lib/errors.js";

import { authenticate, allowRoles, createToken } from "../middleware/auth.js";

import { distanceKm, geocodeAddress, localTimeHHmm } from "../services/maps.service.js";

import { createMidtransSnap, isMockPayment, refundMidtrans, verifyMidtransNotification } from "../services/payment.service.js";

import { notifyOrderParties, notifyUser } from "../services/notification.service.js";

import { uploadImage } from "../lib/cloudinary.js";



const router = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return callback(new HttpError(422, "Foto harus berupa JPG, PNG, atau WebP."));
    }
    callback(null, true);
  },
});

const numeric = (value, fallback = null) => value === undefined || value === null || value === "" ? fallback : Number(value);

const timeNow = () => localTimeHHmm();


const safeUser = (user) => user ? ({

  id: user.id,

  name: user.name,

  email: user.email,

  phone: user.phone,

  address: user.address,

  role: user.role,

}) : null;



function serializeProduct(product) {

  if (!product) return null;

  return {

    id: product.id,

    store_id: product.store_id,

    name: product.name,

    category: product.categoryRef?.name ?? product.category ?? "Lainnya",

    category_id: product.category_id,

    description: product.description,

    stock: product.stock,

    original_price: product.original_price,

    sale_price: product.sale_price,

    safe_until: product.safe_until,

    pickup_from: product.pickup_from,

    pickup_until: product.pickup_until,

    image: product.image,

    active: product.active,

    distance_km: product.distance_km ?? null,

    store: product.store ? {

      id: product.store.id,

      name: product.store.name,

      address: product.store.address,

      latitude: product.store.latitude,

      longitude: product.store.longitude,

      logo: product.store.logo,

    } : null,

    created_at: product.created_at,

    updated_at: product.updated_at,

  };

}



function serializeOrder(order) {

  return {

    id: order.id,

    buyer_id: order.buyer_id,

    store_id: order.store_id,

    buyer_name: order.buyer_name,

    buyer_phone: order.buyer_phone,

    pickup_method: order.pickup_method,

    payment_method: order.payment_method,

    status: order.status,

    payment_status: order.payment_status,

    payment_provider: order.payment_provider,

    pickup_pin: order.pickup_pin,

    cancel_until: order.cancel_until,

    seller_deadline: order.seller_deadline,

    paid_at: order.paid_at,

    refunded_at: order.refunded_at,

    total: order.total,

    created_at: order.created_at,

    updated_at: order.updated_at,

    store: order.store ? { id: order.store.id, name: order.store.name, address: order.store.address } : null,

    review: order.review ?? null,

    payment: order.payment ? {

      provider: order.payment.provider,

      status: order.payment.status,

      payment_method: order.payment.payment_method,

      paid_at: order.payment.paid_at,

      refunded_at: order.payment.refunded_at,

    } : null,

    items: (order.items || []).map((item) => {

      const current = item.product ? serializeProduct(item.product) : null;

      return {

        id: item.id,

        order_id: item.order_id,

        product_id: item.product_id,

        product_name_snapshot: item.product_name_snapshot,

        product_image_snapshot: item.product_image_snapshot,

        original_price_snapshot: item.original_price_snapshot,

        quantity: item.quantity,

        unit_price: item.unit_price,

        product: current || {

          id: item.product_id,

          name: item.product_name_snapshot,

          image: item.product_image_snapshot,

          original_price: item.original_price_snapshot,

          sale_price: item.unit_price,

          store_id: order.store_id,

        },

      };

    }),

  };

}



const orderInclude = {

  store: true,

  review: true,

  payment: true,

  items: { include: { product: { include: { store: true, categoryRef: true } } } },

};



async function getMe(userId) {

  const user = await prisma.user.findUnique({

    where: { id: userId },

    include: { store: true },

  });

  if (!user) return null;

  return { ...safeUser(user), store: user.store };

}



async function getSellerStore(userId) {

  const store = await prisma.store.findUnique({ where: { owner_id: userId } });

  if (!store) throw new HttpError(404, "Data toko untuk akun ini belum tersedia.");

  return store;

}



async function resolveCategoryId(name) {

  const category = await prisma.category.findUnique({ where: { name } });

  if (!category || !category.active) throw new HttpError(422, "Kategori produk tidak tersedia. Pilih kategori yang aktif.");

  return category.id;

}



function validateProductInput(body) {

  const fields = {

    name: String(body.name || "").trim(),

    category: String(body.category || "").trim(),

    description: String(body.description || "").trim(),

    stock: numeric(body.stock),

    original_price: numeric(body.original_price),

    sale_price: numeric(body.sale_price),

    safe_until: String(body.safe_until || ""),

    pickup_from: String(body.pickup_from || ""),

    pickup_until: String(body.pickup_until || ""),

  };

  requireValue(fields.name.length > 0 && fields.name.length <= 120, "Nama menu wajib diisi (maksimal 120 karakter).");

  requireValue(fields.category.length > 0, "Kategori menu wajib dipilih.");

  requireValue(fields.description.length > 0, "Deskripsi menu wajib diisi.");

  requireValue(Number.isInteger(fields.stock) && fields.stock >= 0, "Stok harus berupa bilangan bulat minimal 0.");

  requireValue(Number.isInteger(fields.original_price) && fields.original_price > 0, "Harga normal harus lebih besar dari 0.");

  requireValue(Number.isInteger(fields.sale_price) && fields.sale_price > 0, "Harga surplus harus lebih besar dari 0.");

  requireValue(fields.sale_price <= fields.original_price, "Harga surplus tidak boleh melebihi harga normal.");

  for (const key of ["safe_until", "pickup_from", "pickup_until"]) requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(fields[key]), `Format ${key} harus HH:mm.`);

  requireValue(fields.pickup_from < fields.pickup_until, "Waktu pickup selesai harus setelah waktu mulai.");

  return fields;

}



async function restoreOrderStock(tx, orderId) {

  const items = await tx.orderItem.findMany({ where: { order_id: orderId } });

  for (const item of items) {

    if (item.product_id) await tx.product.updateMany({ where: { id: item.product_id }, data: { stock: { increment: item.quantity } } });

  }

}



async function cancelAndRefund(orderId, finalStatus, reason) {

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });

  if (!order || order.refunded_at || order.status.startsWith("Dibatalkan") || order.status === "Pembatalan Diproses") return order;



  const claimed = await prisma.order.updateMany({

    where: {

      id: order.id,

      status: order.status,

      payment_status: order.payment_status,

      refunded_at: null,

    },

    data: { status: "Pembatalan Diproses" },

  });

  if (claimed.count !== 1) {

    return prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });

  }



  try {

    if (order.payment_status === "PAID" && order.payment_provider === "MIDTRANS") {

      // The provider must accept the refund before stock is released locally.

      await refundMidtrans(order, reason);

      await prisma.$transaction(async (tx) => {

        await tx.payment.update({ where: { order_id: order.id }, data: { status: "REFUNDED", refunded_at: new Date() } });

        await restoreOrderStock(tx, order.id);

        await tx.order.update({ where: { id: order.id }, data: { status: finalStatus, payment_status: "REFUNDED", refunded_at: new Date() } });

      });

    } else if (order.payment_status === "PAID" && order.payment_provider === "MOCK") {

      await prisma.$transaction(async (tx) => {

        if (order.payment) await tx.payment.update({ where: { order_id: order.id }, data: { status: "REFUNDED", refunded_at: new Date() } });

        await restoreOrderStock(tx, order.id);

        await tx.order.update({ where: { id: order.id }, data: { status: finalStatus, payment_status: "REFUNDED", refunded_at: new Date() } });

      });

    } else {

      // Pending / failed external payment: no money was collected, so release the reserved stock.

      await prisma.$transaction(async (tx) => {

        await restoreOrderStock(tx, order.id);

        await tx.order.update({ where: { id: order.id }, data: { status: finalStatus, payment_status: "CANCELLED" } });

        if (order.payment) await tx.payment.update({ where: { order_id: order.id }, data: { status: "CANCELLED" } });

      });

    }

  } catch (error) {

    await prisma.order.updateMany({

      where: { id: order.id, status: "Pembatalan Diproses" },

      data: { status: order.status },

    });

    throw error;

  }



  const fresh = await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });

  const message = order.payment_status === "PAID" && order.payment_provider === "MOCK"

    ? `Pesanan #${fresh.id} dibatalkan. Pengembalian dana dicatat dalam mode demo.`

    : order.payment_status === "PAID"

      ? `Pesanan #${fresh.id} dibatalkan. Permintaan refund telah diteruskan ke Midtrans.`

      : `Pesanan #${fresh.id} dibatalkan.`;

  await notifyOrderParties(fresh, order.payment_status === "PAID" ? "REFUND" : "ORDER_CANCELLED", message);

  return fresh;

}



// Public runtime configuration (no secret keys are exposed).

router.get("/config", (_req, res) => {

  res.json({ payment_mode: isMockPayment() ? "mock" : "midtrans", location_provider: process.env.GOOGLE_MAPS_API_KEY ? "google-maps" : "browser-geolocation" });

});



// Public catalogue and store directory.

router.get("/categories", asyncRoute(async (_req, res) => {

  res.json(await prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }));

}));



router.get("/stores", asyncRoute(async (req, res) => {

  const { q = "", category = "Semua" } = req.query;

  const lat = numeric(req.query.lat);

  const lng = numeric(req.query.lng);

  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  const radiusKm = Math.max(0.5, Math.min(50, numeric(req.query.radius_km, 5)));

  const nowTime = timeNow();

  const stores = await prisma.store.findMany({

    where: {

      owner_id: { not: null },

      ...(q ? { OR: [

        { name: { contains: String(q), mode: "insensitive" } },

        { products: { some: { active: true, stock: { gt: 0 }, safe_until: { gte: nowTime }, name: { contains: String(q), mode: "insensitive" } } } },

      ] } : {}),

      ...(category && category !== "Semua" ? { products: { some: { active: true, stock: { gt: 0 }, safe_until: { gte: nowTime }, categoryRef: { name: String(category), active: true } } } } : {}),

    },

    include: {

      products: { where: { active: true, stock: { gt: 0 }, safe_until: { gte: nowTime }, ...(category && category !== "Semua" ? { categoryRef: { name: String(category) } } : {}) }, select: { id: true } },

      orders: { where: { status: "Selesai" }, include: { review: { select: { rating: true } } } },

    },

    orderBy: { name: "asc" },

  });

  const result = stores.map((store) => {

    const ratings = store.orders.map((order) => order.review?.rating).filter((rating) => Number.isFinite(rating));

    const distance = hasLocation && store.latitude !== null && store.longitude !== null

      ? Number(distanceKm(lat, lng, store.latitude, store.longitude).toFixed(1)) : null;

    return {

      id: store.id,

      name: store.name,

      address: store.address,

      latitude: store.latitude,

      longitude: store.longitude,

      available_products_count: store.products.length,

      cover_image: store.logo,

      rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,

      distance_km: distance,

    };

  }).filter((store) => !hasLocation || (store.distance_km !== null && store.distance_km <= radiusKm));

  if (hasLocation) result.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));

  res.json(result);

}));


router.get("/products", asyncRoute(async (req, res) => {
  const { category = "Semua", store_id, q } = req.query;
  const nowTime = timeNow();
  const isStoreDetail = Boolean(store_id);
  const products = await prisma.product.findMany({
    where: {
      ...(isStoreDetail ? {} : { active: true, stock: { gt: 0 }, safe_until: { gte: nowTime } }),
      store: { owner_id: { not: null } },
      ...(store_id ? { store_id: Number(store_id) } : {}),
      ...(category && category !== "Semua" ? { categoryRef: { name: String(category), active: true } } : {}),
      ...(q ? { OR: [
        { name: { contains: String(q), mode: "insensitive" } },
        { store: { name: { contains: String(q), mode: "insensitive" } } },
      ] } : {}),
    },
    include: { store: true, categoryRef: true },
    orderBy: [{ active: "desc" }, { stock: "desc" }, { created_at: "desc" }],
  });
  res.json(products.map(serializeProduct));
}));



// Authentication.

router.get("/me", authenticate, asyncRoute(async (req, res) => {

  res.json(await getMe(req.user.id));

}));



router.post("/register", asyncRoute(async (req, res) => {

  const { name, email, phone, password, password_confirmation, role } = req.body;

  // Public self-registration is exclusively for buyers. Seller/admin accounts

  // must be provisioned manually by an operator, never through this endpoint.

  requireValue(!role || role === "buyer", "Pendaftaran mandiri hanya tersedia untuk pembeli. Akun penjual dan admin dibuat oleh pengelola.", 403);

  requireValue(String(name || "").trim().length > 0, "Nama wajib diisi.");

  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")), "Format email tidak valid.");

  requireValue(String(phone || "").trim().length > 0, "Nomor telepon wajib diisi.");

  requireValue(String(password || "").length >= 8, "Kata sandi minimal 8 karakter.");

  requireValue(password === password_confirmation, "Konfirmasi kata sandi tidak sama.");

  const normalizedEmail = String(email).trim().toLowerCase();

  const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  requireValue(!exists, "Email sudah digunakan.", 409);

  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));

  const user = await prisma.user.create({

    data: {

      name: String(name).trim(),

      email: normalizedEmail,

      phone: String(phone).trim(),

      password: hash,

      role: "buyer",

    },

  });

  const me = await getMe(user.id);

  res.status(201).json({ ...me, token: createToken(user) });

}));



router.post("/login", asyncRoute(async (req, res) => {

  const { email, password, role } = req.body;

  requireValue(email && password && ["buyer", "seller", "admin"].includes(role), "Email, kata sandi, dan peran wajib diisi.");

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });

  if (!user || !(await bcrypt.compare(String(password), user.password))) throw new HttpError(422, "Email atau kata sandi tidak cocok.");

  if (user.role !== role) {

    const label = { buyer: "pembeli", seller: "penjual", admin: "admin" }[user.role] || "akun lain";

    throw new HttpError(422, `Akun ini terdaftar sebagai ${label}. Pilih jalur masuk yang sesuai.`);

  }

  res.json({ ...(await getMe(user.id)), token: createToken(user) });

}));



router.post("/logout", (_req, res) => res.json({ ok: true }));



router.post("/profile", authenticate, imageUpload.single("logo"), asyncRoute(async (req, res) => {

  const { name, phone, address, store_name, store_address, bank_account, latitude, longitude } = req.body;

  requireValue(String(name || "").trim().length > 0, "Nama wajib diisi.");

  const user = await prisma.user.update({

    where: { id: req.user.id },

    data: { name: String(name).trim(), phone: phone || null, address: address || null },

  });



  if (user.role === "seller") {

    const store = await getSellerStore(user.id);

    const update = {};

    if (store_name !== undefined) update.name = String(store_name).trim();

    if (store_address !== undefined) update.address = store_address || null;

    if (bank_account !== undefined) update.bank_account = bank_account || null;

    if (req.file) update.logo = await uploadImage(req.file, "still-good/stores");

    let lat = numeric(latitude);

    let lng = numeric(longitude);

    if ((lat === null || lng === null) && store_address) {

      try {

        const point = await geocodeAddress(store_address);

        if (point) { lat = point.latitude; lng = point.longitude; }

      } catch (error) {

        console.warn("Geocoding error:", error.message);

      }

    }

    if (lat !== null || lng !== null) {

      requireValue(lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180, "Koordinat toko tidak valid.");

      update.latitude = lat;

      update.longitude = lng;

    }

    if (Object.keys(update).length) await prisma.store.update({ where: { id: store.id }, data: update });

  }

  res.json(await getMe(user.id));

}));



// Seller product management.

router.get("/seller/products", authenticate, allowRoles("seller"), asyncRoute(async (req, res) => {
  const store = await getSellerStore(req.user.id);
  const products = await prisma.product.findMany({
    where: { store_id: store.id, active: true },
    include: { store: true, categoryRef: true },
    orderBy: { created_at: "desc" },
  });
  res.json(products.map(serializeProduct));
}));

router.post("/seller/products", authenticate, allowRoles("seller"), imageUpload.single("image"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const input = validateProductInput(req.body);

  const category_id = await resolveCategoryId(input.category);

  const { category: _categoryName, ...productFields } = input;

  requireValue(req.file, "Foto asli makanan wajib diunggah.");

  const product = await prisma.product.create({

    data: { ...productFields, category_id, store_id: store.id, image: await uploadImage(req.file, "still-good/products") },

    include: { store: true, categoryRef: true },

  });

  res.status(201).json(serializeProduct(product));

}));



router.post("/seller/products/:id", authenticate, allowRoles("seller"), imageUpload.single("image"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const existing = await prisma.product.findFirst({ where: { id: Number(req.params.id), store_id: store.id } });

  requireValue(existing, "Menu tidak ditemukan.", 404);

  const input = validateProductInput(req.body);

  const category_id = await resolveCategoryId(input.category);

  const { category: _categoryName, ...productFields } = input;

  const product = await prisma.product.update({

    where: { id: existing.id },

    data: { ...productFields, category_id, ...(req.file ? { image: await uploadImage(req.file, "still-good/products") } : {}) },

    include: { store: true, categoryRef: true },

  });

  res.json(serializeProduct(product));

}));



router.patch("/seller/products/:id", authenticate, allowRoles("seller"), imageUpload.single("image"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const existing = await prisma.product.findFirst({ where: { id: Number(req.params.id), store_id: store.id } });

  requireValue(existing, "Menu tidak ditemukan.", 404);

  const input = validateProductInput(req.body);

  const category_id = await resolveCategoryId(input.category);

  const { category: _categoryName, ...productFields } = input;

  const product = await prisma.product.update({ where: { id: existing.id }, data: { ...productFields, category_id, ...(req.file ? { image: await uploadImage(req.file, "still-good/products") } : {}) }, include: { store: true, categoryRef: true } });

  res.json(serializeProduct(product));

}));



router.delete("/seller/products/:id", authenticate, allowRoles("seller"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const product = await prisma.product.findFirst({ where: { id: Number(req.params.id), store_id: store.id } });

  requireValue(product, "Menu tidak ditemukan.", 404);

  await prisma.product.update({ where: { id: product.id }, data: { active: false } });

  res.json({ ok: true });

}));



// Admin category management.

router.get("/admin/categories", authenticate, allowRoles("admin"), asyncRoute(async (_req, res) => {

  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));

}));

router.post("/admin/categories", authenticate, allowRoles("admin"), asyncRoute(async (req, res) => {

  const name = String(req.body.name || "").trim();

  requireValue(name.length > 0 && name.length <= 80, "Nama kategori wajib diisi (maksimal 80 karakter).");

  requireValue(!(await prisma.category.findUnique({ where: { name } })), "Kategori sudah ada.", 409);

  res.status(201).json(await prisma.category.create({ data: { name } }));

}));

router.patch("/admin/categories/:id", authenticate, allowRoles("admin"), asyncRoute(async (req, res) => {

  const id = Number(req.params.id);

  const current = await prisma.category.findUnique({ where: { id } });

  requireValue(current, "Kategori tidak ditemukan.", 404);

  const name = String(req.body.name || current.name).trim();

  const active = req.body.active === undefined ? current.active : Boolean(req.body.active);

  const duplicate = await prisma.category.findFirst({ where: { name, NOT: { id } } });

  requireValue(!duplicate, "Nama kategori sudah digunakan.", 409);

  res.json(await prisma.category.update({ where: { id }, data: { name, active } }));

}));

router.delete("/admin/categories/:id", authenticate, allowRoles("admin"), asyncRoute(async (req, res) => {

  const id = Number(req.params.id);

  const used = await prisma.product.count({ where: { category_id: id } });

  requireValue(used === 0, "Kategori masih digunakan produk dan tidak dapat dihapus.");

  await prisma.category.delete({ where: { id } });

  res.json({ ok: true });

}));

// Admin seller & store provisioning.
router.get("/admin/sellers", authenticate, allowRoles("admin"), asyncRoute(async (_req, res) => {
  const sellers = await prisma.user.findMany({
    where: { role: "seller" },
    include: { store: true },
    orderBy: { created_at: "desc" },
  });
  res.json(sellers.map((u) => ({ ...safeUser(u), store: u.store })));
}));

router.post("/admin/sellers", authenticate, allowRoles("admin"), asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  const cleanName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  requireValue(cleanName.length > 0 && cleanName.length <= 100, "Nama penjual wajib diisi (maksimal 100 karakter).");
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail), "Format email tidak valid.");
  requireValue(String(password || "").length >= 8, "Kata sandi minimal 8 karakter.");

  const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  requireValue(!exists, "Email sudah digunakan.", 409);

  const hash = await bcrypt.hash(String(password), Number(process.env.BCRYPT_ROUNDS || 12));

  const created = await prisma.$transaction(async (tx) => {
    const seller = await tx.user.create({
      data: {
        name: cleanName,
        email: normalizedEmail,
        password: hash,
        role: "seller",
      },
    });

    const store = await tx.store.create({
      data: {
        owner_id: seller.id,
        name: `Toko ${cleanName}`,
      },
    });

    return { ...safeUser(seller), store };
  });

  res.status(201).json(created);
}));

// Orders, stock reservation and payment.

router.post("/orders", authenticate, allowRoles("buyer"), asyncRoute(async (req, res) => {

  const { buyer_name, buyer_phone, items, pickup_method, payment_method } = req.body;

  requireValue(String(buyer_name || "").trim().length > 0, "Nama pemesan wajib diisi.");

  requireValue(String(buyer_phone || "").trim().length > 0, "Nomor WhatsApp wajib diisi.");

  requireValue(Array.isArray(items) && items.length > 0 && items.length <= 20, "Keranjang tidak valid.");

  requireValue(["pickup", "gosend"].includes(pickup_method), "Metode pengambilan tidak valid.");

  requireValue(["QRIS", "Tunai"].includes(payment_method), "Metode Pembayaran Tidak Valid. Pilih QRIS atau Tunai");

  const aggregated = new Map();

  for (const item of items) {

    const id = Number(item.id);

    const qty = Number(item.qty);

    requireValue(Number.isInteger(id) && id > 0 && Number.isInteger(qty) && qty > 0, "Jumlah produk dalam keranjang tidak valid.");

    aggregated.set(id, (aggregated.get(id) || 0) + qty);

  }



  const order = await prisma.$transaction(async (tx) => {

    const lines = [];

    let storeId = null;

    let total = 0;

    for (const [productId, quantity] of aggregated) {

      const product = await tx.product.findUnique({ where: { id: productId }, include: { store: true, categoryRef: true } });

      requireValue(product && product.active && product.safe_until >= timeNow(), "Menu tidak tersedia atau batas aman konsumsi telah lewat.");

      requireValue(product.store?.owner_id !== null && product.store?.owner_id !== undefined, "Toko belum memiliki pemilik terdaftar.");

      requireValue(product.stock >= quantity, `Stok ${product.name} tidak mencukupi.`);

      if (storeId !== null) requireValue(storeId === product.store_id, "Satu checkout hanya dapat berisi menu dari satu toko.");

      storeId = product.store_id;

      const changed = await tx.product.updateMany({ where: { id: productId, active: true, stock: { gte: quantity }, safe_until: { gte: timeNow() } }, data: { stock: { decrement: quantity } } });

      requireValue(changed.count === 1, `Stok ${product.name} baru saja berubah. Muat ulang menu dan coba lagi.`, 409);

      lines.push({ product, quantity });

      total += product.sale_price * quantity;

    }

    const paymentMode = payment_method === "Tunai" ? "Cash" : (isMockPayment()? "MOCK" : "MIDTRANS");

    const providerOrderId = `SG-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const created = await tx.order.create({

      data: {

        buyer_id: req.user.id,

        store_id: storeId,

        buyer_name: String(buyer_name).trim(),

        buyer_phone: String(buyer_phone).trim(),

        pickup_method,

        payment_method,

        status: paymentMode !== "MOCK" ? "Menunggu Konfirmasi" : "Menunggu Pembayaran",

        payment_status: paymentMode === "MOCK" ? "PAID" : "PENDING",

        payment_provider: paymentMode,

        provider_order_id: providerOrderId,

        pickup_pin: String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"),

        cancel_until: paymentMode !== "MOCK" ? new Date(Date.now() + 60_000) : null,

        seller_deadline: paymentMode !== "MOCK" ? new Date(Date.now() + 5 * 60_000) : null,

        paid_at: paymentMode === "MOCK" ? new Date() : null,

        total,

        items: {

          create: lines.map(({ product, quantity }) => ({

            product_id: product.id,

            product_name_snapshot: product.name,

            product_image_snapshot: product.image,

            original_price_snapshot: product.original_price,

            quantity,

            unit_price: product.sale_price,

          })),

        },

        payment: {

          create: {

            provider: paymentMode,

            payment_method,

            amount: total,

            status: paymentMode === "MOCK" ? "PAID" : "PENDING",

            paid_at: paymentMode === "MOCK" ? new Date() : null,

          },

        },

      },

      include: orderInclude,

    });

    return created;

  });



  if (order.payment_provider === "MIDTRANS") {

    try {

      const snap = await createMidtransSnap(order);

      const payment = await notifyOrderParties(order, "NEW_ORDER", 'Pesanan #${order.id} masuk${order.payment_provider === "CASH" ? " (Bayar tunai saat pengambilan )" : ""}. Konfirmasi sebelum batas waktu lima menit.');
      res.status(201).json({ ...serializeOrder(order), payment_mode: order.payment_provider === "CASH" ? "cash" : "MOCK" });

      return;

    } catch (error) {

      await prisma.$transaction(async (tx) => {

        await restoreOrderStock(tx, order.id);

        await tx.order.update({ where: { id: order.id }, data: { status: "Dibatalkan Pembayaran", payment_status: "FAILED" } });

        await tx.payment.update({ where: { order_id: order.id }, data: { status: "FAILED" } });

      });

      throw error;

    }

  }



  await notifyOrderParties(order, "NEW_ORDER", `Pesanan #${order.id} masuk. Konfirmasi sebelum batas waktu lima menit.`);

  res.status(201).json({ ...serializeOrder(order), payment_mode: "mock" });

}));



router.get("/orders", authenticate, asyncRoute(async (req, res) => {

  const where = req.user.role === "seller"

    ? { store_id: (await getSellerStore(req.user.id)).id }

    : req.user.role === "admin" ? {} : { buyer_id: req.user.id };

  const orders = await prisma.order.findMany({ where, include: orderInclude, orderBy: { created_at: "desc" } });

  res.json(orders.map(serializeOrder));

}));



router.get("/orders/:id", authenticate, asyncRoute(async (req, res) => {

  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: orderInclude });

  requireValue(order, "Pesanan tidak ditemukan.", 404);

  if (req.user.role === "buyer") requireValue(order.buyer_id === req.user.id, "Pesanan ini bukan milik akun kamu.", 403);

  else if (req.user.role === "seller") requireValue(order.store_id === (await getSellerStore(req.user.id)).id, "Pesanan ini bukan milik toko kamu.", 403);

  res.json(serializeOrder(order));

}));



router.get("/seller/orders", authenticate, allowRoles("seller"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const orders = await prisma.order.findMany({ where: { store_id: store.id }, include: orderInclude, orderBy: [{ status: "asc" }, { created_at: "desc" }] });

  res.json(orders.map(serializeOrder));

}));



router.post("/orders/:id/cancel", authenticate, allowRoles("buyer"), asyncRoute(async (req, res) => {

  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });

  requireValue(order && order.buyer_id === req.user.id, "Pesanan tidak ditemukan.", 404);

  requireValue(order.status === "Menunggu Konfirmasi" && order.cancel_until && Date.now() <= order.cancel_until.getTime(), "Masa pembatalan satu menit telah berakhir.");

  const updated = await cancelAndRefund(order.id, "Dibatalkan Pembeli", "Pembeli membatalkan pesanan dalam satu menit setelah pembayaran.");

  res.json(updated);

}));



router.post("/orders/:id/status", authenticate, allowRoles("seller"), asyncRoute(async (req, res) => {

  const store = await getSellerStore(req.user.id);

  const orderId = Number(req.params.id);

  const order = await prisma.order.findFirst({ where: { id: orderId, store_id: store.id } });

  requireValue(order, "Pesanan tidak ditemukan.", 404);

  const { status, pickup_pin } = req.body;

  requireValue(["Diproses", "Siap Diambil", "Selesai", "Ditolak"].includes(status), "Status pesanan tidak valid.");

  if (status === "Ditolak") {

    requireValue(order.status === "Menunggu Konfirmasi" || order.status === "Diproses", "Pesanan tidak dapat ditolak pada tahap ini.");

    const updated = await cancelAndRefund(order.id, "Dibatalkan Penjual", "Penjual menolak pesanan.");

    res.json(updated);

    return;

  }

  const transitions = {

    "Menunggu Konfirmasi": ["Diproses"],

    Diproses: ["Siap Diambil"],

    "Siap Diambil": ["Selesai"],

  };

  requireValue((transitions[order.status] || []).includes(status), "Perubahan status pesanan tidak sesuai alur.");

  if (status === "Selesai") requireValue(String(pickup_pin || "") === order.pickup_pin, "PIN pickup tidak cocok.");

  if (order.status === "Menunggu Konfirmasi" && order.seller_deadline && Date.now() > order.seller_deadline.getTime()) {

    const updated = await cancelAndRefund(order.id, "Dibatalkan Penjual", "Penjual melewati batas konfirmasi lima menit.");

    res.json(updated);

    return;

  }

  const completingCash = status === "Selesai" && order.payment_provider === "CASH";

  if (completingCash)
    await prisma.payment.updateMany({
      where: { order_id: order.id },
      data: { status: "PAID", paid_at: new Date() },
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: completingCash
        ? { status, payment_status: "PAID", paid_at: new Date() }
        : { status },
      include: orderInclude,
    });

  const fresh = serializeOrder(updated);

  const message = status === "Selesai" ? `Pesanan #${order.id} selesai. Terima kasih sudah menyelamatkan makanan!` : `Status pesanan #${order.id} berubah menjadi ${status}.`;

  await notifyOrderParties(updated, "ORDER_STATUS", message);

  res.json(fresh);

}));



router.post("/reviews", authenticate, allowRoles("buyer"), asyncRoute(async (req, res) => {

  const orderId = Number(req.body.order_id);

  const rating = Number(req.body.rating);

  const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 500) : null;

  const order = await prisma.order.findFirst({ where: { id: orderId, buyer_id: req.user.id } });

  requireValue(order && order.status === "Selesai", "Ulasan hanya dapat diberikan untuk pesanan yang selesai.");

  requireValue(Number.isInteger(rating) && rating >= 1 && rating <= 5, "Rating harus berada di antara 1 sampai 5.");

  requireValue(!(await prisma.review.findUnique({ where: { order_id: orderId } })), "Pesanan ini sudah memiliki ulasan.", 409);

  const review = await prisma.review.create({ data: { order_id: orderId, rating, comment } });

  res.status(201).json(review);

}));



router.get("/notifications", authenticate, asyncRoute(async (req, res) => {

  res.json(await prisma.notification.findMany({ where: { user_id: req.user.id }, orderBy: { created_at: "desc" }, take: 50 }));

}));



// Midtrans calls this webhook after payment state changes.

router.post("/payments/midtrans/notification", asyncRoute(async (req, res) => {

  const body = req.body;

  requireValue(verifyMidtransNotification(body), "Signature notifikasi Midtrans tidak valid.", 401);

  const order = await prisma.order.findUnique({ where: { provider_order_id: String(body.order_id) } });

  requireValue(order, "Referensi pesanan tidak ditemukan.", 404);

  const gross = Math.round(Number(body.gross_amount));

  requireValue(gross === order.total, "Nominal notifikasi pembayaran tidak cocok.", 422);

  const transactionStatus = String(body.transaction_status || "").toLowerCase();

  const fraudAccepted = !body.fraud_status || String(body.fraud_status).toLowerCase() === "accept";

  const isPaidEvent = (transactionStatus === "settlement" || transactionStatus === "capture") && fraudAccepted;



  // Midtrans may retry notifications. Never restart the buyer/seller timers after payment is already settled.

  if (order.payment_status === "PAID" || order.payment_status === "REFUNDED") {

    return res.json({ ok: true, duplicate: true });

  }



  if (isPaidEvent) {

    if (order.status.startsWith("Dibatalkan") || order.status === "Pembatalan Diproses" || order.payment_status === "CANCELLED") {

      // A delayed success can arrive after our unpaid-order expiry. Refund it rather than reopening the order.

      await refundMidtrans(order, "Pembayaran diterima setelah pesanan dibatalkan atau kedaluwarsa.");

      await prisma.payment.update({

        where: { order_id: order.id },

        data: { status: "REFUNDED", provider_transaction_id: body.transaction_id || null, refunded_at: new Date(), raw_notification: body },

      });

      await prisma.order.update({

        where: { id: order.id },

        data: { payment_status: "REFUNDED", provider_transaction_id: body.transaction_id || null, refunded_at: new Date() },

      });

      return res.json({ ok: true, late_payment_refunded: true });

    }



    const paidAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {

      await tx.payment.update({

        where: { order_id: order.id },

        data: { status: "PAID", provider_transaction_id: body.transaction_id || null, paid_at: paidAt, raw_notification: body },

      });

      return tx.order.update({

        where: { id: order.id },

        data: {

          status: "Menunggu Konfirmasi",

          payment_status: "PAID",

          provider_transaction_id: body.transaction_id || null,

          paid_at: paidAt,

          cancel_until: new Date(paidAt.getTime() + 60_000),

          seller_deadline: new Date(paidAt.getTime() + 5 * 60_000),

        },

      });

    });

    await notifyOrderParties(updated, "NEW_ORDER", `Pembayaran pesanan #${updated.id} berhasil. Penjual diminta mengonfirmasi dalam lima menit.`);

  } else if (["expire", "cancel", "deny"].includes(transactionStatus)) {

    await prisma.payment.update({ where: { order_id: order.id }, data: { status: "FAILED", raw_notification: body } });

    await cancelAndRefund(order.id, "Dibatalkan Pembayaran", "Pembayaran tidak berhasil atau kedaluwarsa.");

  } else {

    await prisma.payment.update({ where: { order_id: order.id }, data: { status: "PENDING", raw_notification: body } });

  }

  res.json({ ok: true });

}));



// Payment return page polls this endpoint after Midtrans redirects the buyer back.

router.get("/payments/status/:orderId", authenticate, asyncRoute(async (req, res) => {

  const order = await prisma.order.findUnique({ where: { id: Number(req.params.orderId) }, include: { payment: true } });

  requireValue(order && order.buyer_id === req.user.id, "Pesanan tidak ditemukan.", 404);

  res.json({ order_id: order.id, status: order.status, payment_status: order.payment_status, pickup_pin: order.pickup_pin, cancel_until: order.cancel_until });

}));



export default router;
