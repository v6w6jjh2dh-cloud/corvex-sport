const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function hashPassword(password, saltText = null) {
  const enc = new TextEncoder();

  const salt = saltText
    ? Uint8Array.from(atob(saltText), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    key,
    256
  );

  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltOut = btoa(String.fromCharCode(...salt));

  return `${saltOut}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt] = String(stored || "").split(":");

  if (!salt) return false;

  return (await hashPassword(password, salt)) === stored;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireDB(env) {
  if (!env || !env.DB) {
    throw new Error(
      "D1 binding DB is not available. Check Cloudflare Pages Settings > Bindings and redeploy."
    );
  }

  return env.DB;
}

async function auth(request, env) {
  const DB = requireDB(env);

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return null;

  const row = await DB.prepare(`
    SELECT
      s.token,
      s.expires_at,
      u.id,
      u.username,
      u.display_name,
      u.role,
      u.is_active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token = ?
      AND s.expires_at > datetime('now')
      AND u.is_active = 1
  `)
    .bind(token)
    .first();

  return row || null;
}

function normalizePhone(value = "") {
  return String(value).replace(/[^0-9+]/g, "").trim();
}

function orderSelectSql(where = "") {
  return `
    SELECT
      o.*,
      u.display_name AS created_by_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by
    ${where}
  `;
}

async function listOrders(url, env) {
  const DB = requireDB(env);

  const q = (url.searchParams.get("q") || "").trim();
  const printed = url.searchParams.get("printed");
  const fromCode = url.searchParams.get("from_code");
  const toCode = url.searchParams.get("to_code");
  const fromDate = url.searchParams.get("from_date");
  const toDate = url.searchParams.get("to_date");

  const params = [];
  const where = [];

  if (q) {
    where.push(`
      (
        CAST(o.order_code AS TEXT) LIKE ?
        OR o.phone LIKE ?
        OR o.recipient_name LIKE ?
        OR o.detailed_address LIKE ?
      )
    `);

    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (printed === "0" || printed === "1") {
    where.push("o.printed = ?");
    params.push(Number(printed));
  }

  if (fromCode) {
    where.push("o.order_code >= ?");
    params.push(Number(fromCode));
  }

  if (toCode) {
    where.push("o.order_code <= ?");
    params.push(Number(toCode));
  }

  if (fromDate) {
    where.push("date(o.created_at) >= date(?)");
    params.push(fromDate);
  }

  if (toDate) {
    where.push("date(o.created_at) <= date(?)");
    params.push(toDate);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const stmt = DB.prepare(`
    ${orderSelectSql(clause)}
    ORDER BY o.id DESC
    LIMIT 1000
  `).bind(...params);

  return await stmt.all();
}

export async function onRequest(context) {
  const { request, env, params } = context;

  const url = new URL(request.url);

  const path =
    "/" +
    (params.path && Array.isArray(params.path)
      ? params.path.join("/")
      : params.path || "");

  const method = request.method.toUpperCase();

  try {
    /*
     * DEBUG
     * افتح:
     * /api/debug
     *
     * للتأكد أن Cloudflare يمرر Binding DB.
     */
    if (path === "/debug" && method === "GET") {
      return json({
        ok: true,
        envKeys: Object.keys(env || {}),
        hasDB: Boolean(env && env.DB),
        dbType: env?.DB ? typeof env.DB : null,
      });
    }

    const DB = requireDB(env);

    /*
     * SETUP
     */
    if (path === "/setup" && method === "GET") {
      const row = await DB.prepare(
        "SELECT COUNT(*) AS c FROM users"
      ).first();

      return json({
        needs_setup: Number(row?.c || 0) === 0,
      });
    }

    if (path === "/setup" && method === "POST") {
      const row = await DB.prepare(
        "SELECT COUNT(*) AS c FROM users"
      ).first();

      if (Number(row?.c || 0) > 0) {
        return json(
          {
            error: "تم إعداد النظام مسبقاً",
          },
          409
        );
      }

      const body = await readBody(request);

      const username = String(body.username || "").trim();
      const displayName = String(body.display_name || "").trim();
      const password = String(body.password || "");

      if (!username || !displayName || password.length < 6) {
        return json(
          {
            error:
              "البيانات غير مكتملة، وكلمة المرور يجب أن تكون 6 أحرف على الأقل",
          },
          400
        );
      }

      const passwordHash = await hashPassword(password);

      await DB.prepare(`
        INSERT INTO users (
          username,
          display_name,
          password_hash,
          role
        )
        VALUES (?, ?, ?, ?)
      `)
        .bind(username, displayName, passwordHash, "admin")
        .run();

      return json({
        ok: true,
        message: "تم إنشاء حساب المدير بنجاح",
      });
    }

    /*
     * LOGIN
     */
    if (path === "/login" && method === "POST") {
      const body = await readBody(request);

      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      const user = await DB.prepare(`
        SELECT *
        FROM users
        WHERE username = ?
          AND is_active = 1
      `)
        .bind(username)
        .first();

      if (
        !user ||
        !(await verifyPassword(password, user.password_hash))
      ) {
        return json(
          {
            error: "اسم المستخدم أو كلمة المرور غير صحيحة",
          },
          401
        );
      }

      const token = randomToken();

      await DB.prepare(`
        INSERT INTO sessions (
          token,
          user_id,
          expires_at
        )
        VALUES (
          ?,
          ?,
          datetime('now', '+30 days')
        )
      `)
        .bind(token, user.id)
        .run();

      return json({
        token,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
        },
      });
    }

    /*
     * كل المسارات التالية تحتاج Login.
     */
    const me = await auth(request, env);

    if (!me) {
      return json(
        {
          error: "غير مصرح",
        },
        401
      );
    }

    /*
     * CURRENT USER
     */
    if (path === "/me" && method === "GET") {
      return json({
        user: {
          id: me.id,
          username: me.username,
          display_name: me.display_name,
          role: me.role,
        },
      });
    }

    /*
     * LOGOUT
     */
    if (path === "/logout" && method === "POST") {
      const token = (
        request.headers.get("authorization") || ""
      ).replace(/^Bearer\s+/, "");

      await DB.prepare(
        "DELETE FROM sessions WHERE token = ?"
      )
        .bind(token)
        .run();

      return json({
        ok: true,
      });
    }

    /*
     * DASHBOARD
     */
    if (path === "/dashboard" && method === "GET") {
      const stats = await DB.prepare(`
        SELECT
          COUNT(*) AS total,

          SUM(
            CASE
              WHEN printed = 0 THEN 1
              ELSE 0
            END
          ) AS unprinted,

          SUM(
            CASE
              WHEN printed = 1 THEN 1
              ELSE 0
            END
          ) AS printed,

          SUM(
            CASE
              WHEN date(created_at) = date('now') THEN 1
              ELSE 0
            END
          ) AS today

        FROM orders
      `).first();

      const batchCount = await DB.prepare(`
        SELECT COUNT(*) AS c
        FROM print_batches
      `).first();

      return json({
        total: Number(stats?.total || 0),
        unprinted: Number(stats?.unprinted || 0),
        printed: Number(stats?.printed || 0),
        today: Number(stats?.today || 0),
        batches: Number(batchCount?.c || 0),
      });
    }

    /*
     * ORDERS LIST
     */
    if (path === "/orders" && method === "GET") {
      const result = await listOrders(url, env);

      return json({
        orders: result.results || [],
      });
    }

    /*
     * CREATE ORDER
     */
    if (path === "/orders" && method === "POST") {
      const b = await readBody(request);

      const name = String(b.recipient_name || "").trim();
      const phone = normalizePhone(b.phone);

      if (!name || !phone) {
        return json(
          {
            error: "الاسم ورقم الهاتف مطلوبان",
          },
          400
        );
      }

      const max = await DB.prepare(`
        SELECT
          COALESCE(MAX(order_code), 4400) AS m
        FROM orders
      `).first();

      const code = Number(max?.m || 4400) + 1;

      const result = await DB.prepare(`
        INSERT INTO orders (
          order_code,
          recipient_name,
          phone,
          area,
          detailed_address,
          amount,
          order_notes,
          raw_text,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          code,
          name,
          phone,
          String(b.area || "").trim(),
          String(b.detailed_address || "").trim(),
          Number(b.amount || 0),
          String(b.order_notes || "").trim(),
          String(b.raw_text || ""),
          me.id
        )
        .run();

      const order = await DB.prepare(
        orderSelectSql("WHERE o.id = ?")
      )
        .bind(result.meta.last_row_id)
        .first();

      return json(
        {
          order,
        },
        201
      );
    }

    /*
     * SINGLE ORDER
     */
    const orderMatch = path.match(/^\/orders\/(\d+)$/);

    if (orderMatch && method === "GET") {
      const id = Number(orderMatch[1]);

      const order = await DB.prepare(
        orderSelectSql("WHERE o.id = ?")
      )
        .bind(id)
        .first();

      if (!order) {
        return json(
          {
            error: "الطلب غير موجود",
          },
          404
        );
      }

      return json({
        order,
      });
    }

    /*
     * UPDATE ORDER
     */
    if (orderMatch && method === "PUT") {
      const b = await readBody(request);
      const id = Number(orderMatch[1]);

      await DB.prepare(`
        UPDATE orders

        SET
          recipient_name = ?,
          phone = ?,
          area = ?,
          detailed_address = ?,
          amount = ?,
          order_notes = ?,
          updated_at = datetime('now')

        WHERE id = ?
      `)
        .bind(
          String(b.recipient_name || "").trim(),
          normalizePhone(b.phone),
          String(b.area || "").trim(),
          String(b.detailed_address || "").trim(),
          Number(b.amount || 0),
          String(b.order_notes || "").trim(),
          id
        )
        .run();

      const order = await DB.prepare(
        orderSelectSql("WHERE o.id = ?")
      )
        .bind(id)
        .first();

      return json({
        order,
      });
    }

    /*
     * USERS
     */
    if (path === "/users" && method === "GET") {
      if (me.role !== "admin") {
        return json(
          {
            error: "صلاحية مدير مطلوبة",
          },
          403
        );
      }

      const rows = await DB.prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          is_active,
          created_at

        FROM users

        ORDER BY id DESC
      `).all();

      return json({
        users: rows.results || [],
      });
    }

    if (path === "/users" && method === "POST") {
      if (me.role !== "admin") {
        return json(
          {
            error: "صلاحية مدير مطلوبة",
          },
          403
        );
      }

      const b = await readBody(request);

      if (
        !b.username ||
        !b.display_name ||
        String(b.password || "").length < 6
      ) {
        return json(
          {
            error: "بيانات المستخدم غير مكتملة",
          },
          400
        );
      }

      const hash = await hashPassword(
        String(b.password)
      );

      await DB.prepare(`
        INSERT INTO users (
          username,
          display_name,
          password_hash,
          role
        )
        VALUES (?, ?, ?, ?)
      `)
        .bind(
          String(b.username).trim(),
          String(b.display_name).trim(),
          hash,
          b.role === "admin" ? "admin" : "staff"
        )
        .run();

      return json(
        {
          ok: true,
        },
        201
      );
    }

    /*
     * CREATE PRINT BATCH
     */
    if (
      path === "/print-batches" &&
      method === "POST"
    ) {
      const b = await readBody(request);

      const ids = Array.isArray(b.order_ids)
        ? [
            ...new Set(
              b.order_ids
                .map(Number)
                .filter(Boolean)
            ),
          ]
        : [];

      if (!ids.length) {
        return json(
          {
            error: "حدد طلبات للطباعة",
          },
          400
        );
      }

      const placeholders = ids
        .map(() => "?")
        .join(",");

      const rows = await DB.prepare(`
        ${orderSelectSql(
          `WHERE o.id IN (${placeholders})`
        )}
        ORDER BY o.order_code ASC
      `)
        .bind(...ids)
        .all();

      const orders = rows.results || [];

      if (!orders.length) {
        return json(
          {
            error: "لا توجد طلبات صالحة",
          },
          400
        );
      }

      const batchCode =
        `PB-` +
        new Date()
          .toISOString()
          .replace(/\D/g, "")
          .slice(0, 14) +
        `-${Math.floor(
          Math.random() * 900 + 100
        )}`;

      const batchRes = await DB.prepare(`
        INSERT INTO print_batches (
          batch_code,
          created_by,
          order_count
        )
        VALUES (?, ?, ?)
      `)
        .bind(
          batchCode,
          me.id,
          orders.length
        )
        .run();

      const batchId =
        batchRes.meta.last_row_id;

      for (
        let i = 0;
        i < orders.length;
        i++
      ) {
        await DB.prepare(`
          INSERT INTO print_batch_orders (
            batch_id,
            order_id,
            position
          )
          VALUES (?, ?, ?)
        `)
          .bind(
            batchId,
            orders[i].id,
            i + 1
          )
          .run();

        await DB.prepare(`
          UPDATE orders

          SET
            printed = 1,
            print_count = print_count + 1,
            first_printed_at =
              COALESCE(
                first_printed_at,
                datetime('now')
              ),
            last_printed_at =
              datetime('now')

          WHERE id = ?
        `)
          .bind(orders[i].id)
          .run();
      }

      return json(
        {
          batch: {
            id: batchId,
            batch_code: batchCode,
            order_count: orders.length,
          },
          orders,
        },
        201
      );
    }

    /*
     * LIST PRINT BATCHES
     */
    if (
      path === "/print-batches" &&
      method === "GET"
    ) {
      const rows = await DB.prepare(`
        SELECT
          b.*,
          u.display_name AS created_by_name

        FROM print_batches b

        LEFT JOIN users u
          ON u.id = b.created_by

        ORDER BY b.id DESC

        LIMIT 100
      `).all();

      return json({
        batches: rows.results || [],
      });
    }

    /*
     * SINGLE PRINT BATCH
     */
    const batchMatch = path.match(
      /^\/print-batches\/(\d+)$/
    );

    if (
      batchMatch &&
      method === "GET"
    ) {
      const batchId = Number(
        batchMatch[1]
      );

      const batch = await DB.prepare(`
        SELECT
          b.*,
          u.display_name AS created_by_name

        FROM print_batches b

        LEFT JOIN users u
          ON u.id = b.created_by

        WHERE b.id = ?
      `)
        .bind(batchId)
        .first();

      if (!batch) {
        return json(
          {
            error:
              "دفعة الطباعة غير موجودة",
          },
          404
        );
      }

      const rows = await DB.prepare(`
        ${orderSelectSql(`
          JOIN print_batch_orders pbo
            ON pbo.order_id = o.id

          WHERE pbo.batch_id = ?
        `)}

        ORDER BY pbo.position ASC
      `)
        .bind(batchId)
        .all();

      return json({
        batch,
        orders: rows.results || [],
      });
    }

    /*
     * UNPRINTED ORDERS
     */
    if (
      path === "/unprinted" &&
      method === "GET"
    ) {
      const rows = await DB.prepare(`
        ${orderSelectSql(
          "WHERE o.printed = 0"
        )}

        ORDER BY o.order_code ASC
      `).all();

      return json({
        orders: rows.results || [],
      });
    }

    return json(
      {
        error: "المسار غير موجود",
      },
      404
    );
  } catch (e) {
    console.error("CORVEX API ERROR:", e);

    return json(
      {
        error:
          e?.message ||
          "حدث خطأ غير متوقع",
      },
      500
    );
  }
}
