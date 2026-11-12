CREATE TABLE "users" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(190) NOT NULL,
  "phone" VARCHAR(30),
  "password" VARCHAR(255) NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'buyer',
  "address" VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "stores" (
  "id" SERIAL NOT NULL,
  "owner_id" INTEGER,
  "name" VARCHAR(120) NOT NULL,
  "address" VARCHAR(255),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "phone" VARCHAR(30),
  "bank_account" VARCHAR(100),
  "logo" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stores_owner_id_key" ON "stores"("owner_id");
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "categories" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

CREATE TABLE "products" (
  "id" SERIAL NOT NULL,
  "store_id" INTEGER NOT NULL,
  "category_id" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "original_price" INTEGER NOT NULL,
  "sale_price" INTEGER NOT NULL,
  "safe_until" VARCHAR(5) NOT NULL,
  "pickup_from" VARCHAR(5) NOT NULL,
  "pickup_until" VARCHAR(5) NOT NULL,
  "image" VARCHAR(500),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "products_store_id_active_stock_idx" ON "products"("store_id", "active", "stock");
CREATE INDEX "products_category_id_active_idx" ON "products"("category_id", "active");
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "orders" (
  "id" SERIAL NOT NULL,
  "buyer_id" INTEGER NOT NULL,
  "store_id" INTEGER NOT NULL,
  "buyer_name" VARCHAR(100) NOT NULL,
  "buyer_phone" VARCHAR(30) NOT NULL,
  "pickup_method" VARCHAR(20) NOT NULL,
  "payment_method" VARCHAR(30) NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'Menunggu Pembayaran',
  "payment_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payment_provider" VARCHAR(20) NOT NULL DEFAULT 'MOCK',
  "provider_order_id" VARCHAR(50),
  "provider_transaction_id" VARCHAR(100),
  "pickup_pin" VARCHAR(6) NOT NULL,
  "cancel_until" TIMESTAMPTZ(6),
  "seller_deadline" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "refunded_at" TIMESTAMPTZ(6),
  "total" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orders_provider_order_id_key" ON "orders"("provider_order_id");
CREATE INDEX "orders_buyer_id_created_at_idx" ON "orders"("buyer_id", "created_at");
CREATE INDEX "orders_store_id_status_seller_deadline_idx" ON "orders"("store_id", "status", "seller_deadline");
CREATE INDEX "orders_payment_status_created_at_idx" ON "orders"("payment_status", "created_at");
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_items" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "product_id" INTEGER,
  "product_name_snapshot" VARCHAR(120) NOT NULL,
  "product_image_snapshot" VARCHAR(500),
  "original_price_snapshot" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payments" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "provider" VARCHAR(20) NOT NULL,
  "provider_transaction_id" VARCHAR(100),
  "payment_method" VARCHAR(30) NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "snap_token" VARCHAR(255),
  "redirect_url" VARCHAR(1000),
  "raw_notification" JSONB,
  "paid_at" TIMESTAMPTZ(6),
  "refunded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reviews" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "order_id" INTEGER,
  "type" VARCHAR(40) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
