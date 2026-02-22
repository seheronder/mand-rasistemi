const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // 16 haneli güvenli kod
require('dotenv').config();
const app = express();


//AYARLAR VE GÜVENLİK


app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Resim klasörü kontrolü
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Dosya Yükleme Ayarı (Resimler için)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const pool = new Pool({
    user: process.env.DB_USER,      // Artık dosyadan okuyor
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD, // Şifre burada gizli
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

async function logKaydet(userId, message) {
    try {
        const res = await pool.query("SELECT mandira_code FROM profiles WHERE id = $1", [userId]);

        if (res.rows.length > 0) {
            const mandiraCode = res.rows[0].mandira_code;

            await pool.query(
                "INSERT INTO activity_logs (user_id, mandira_code, message) VALUES ($1, $2, $3)",
                [userId, mandiraCode, message]
            );
        }
    } catch (err) {
        console.error("Loglama Hatası:", err.message);
    }
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tolgakacaresmi@gmail.com',
        pass: 'xmrd owfy ieyt gmjn'
    }
});

const getUserId = (req) => {
    const uid = req.headers['user-id'];
    if (!uid) throw new Error("Oturum süresi dolmuş veya giriş yapılmamış.");
    return uid;
};

const getMandiraCode = async (userId) => {
    const res = await pool.query("SELECT mandira_code FROM profiles WHERE id = $1", [userId]);
    if (res.rows.length === 0) throw new Error("Kullanıcı bulunamadı.");
    return res.rows[0].mandira_code;
};

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await pool.query(
            "SELECT * FROM profiles WHERE (name = $1 OR email = $1) AND password = $2",
            [username, password]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({
                basarili: true,
                id: user.id,
                username: user.name,
                shop_code: user.mandira_code,
                role: user.role
            });
        } else {
            res.status(401).json({ basarili: false, mesaj: "Kullanıcı adı veya şifre hatalı!" });
        }
    } catch (err) {
        res.status(500).json({ basarili: false, mesaj: err.message });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { username, email, password, phone} = req.body;

        const check = await pool.query("SELECT * FROM profiles WHERE name = $1 OR email = $2", [username, email]);
        if (check.rows.length > 0) {
            return res.status(400).json({ basarili: false, mesaj: "Bu kullanıcı zaten kayıtlı." });
        }

        const insertRes = await pool.query(
            `INSERT INTO profiles (id, name, email, password, role, phone) 
             VALUES (gen_random_uuid(), $1, $2, $3, 'admin', $4) 
             RETURNING mandira_code`,
            [username, email, password]
        );

        const uretilenKod = insertRes.rows[0].mandira_code;
        console.log(`✅ Yeni Kayıt: ${username} - Kod: ${uretilenKod}`);

        res.json({
            basarili: true,
            mesaj: "Kayıt başarılı!",
            kod: uretilenKod
        });

    } catch (err) {
        console.error("Kayıt Hatası:", err);
        res.status(500).json({ basarili: false, mesaj: "Sunucu hatası: " + err.message });
    }
});
// Şifremi Unuttum (Kod Gönder)
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (user.rows.length === 0) {
            return res.status(404).json({ basarili: false, mesaj: "Bu e-posta adresi sistemde kayıtlı değil." });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 Haneli Kod

        // Kodu kaydet (15 dk geçerli)
        await pool.query(
            "UPDATE users SET reset_code = $1, reset_expires = NOW() + INTERVAL '15 minutes' WHERE email = $2",
            [code, email]
        );

        // Mail Gönder
        await transporter.sendMail({
            from: '"Mandıra Sistemi" <no-reply@mandira.com>',
            to: email,
            subject: 'Şifre Sıfırlama Kodu',
            text: `Merhaba,\n\nŞifre sıfırlama kodunuz: ${code}\n\nBu kod 15 dakika geçerlidir.`
        });

        res.json({ basarili: true, mesaj: "Kod e-posta adresinize gönderildi." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ basarili: false, mesaj: "Mail gönderilemedi." });
    }
});

// Şifre Sıfırla (Yeni Şifre)
app.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        const user = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND reset_code = $2 AND reset_expires > NOW()",
            [email, code]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ basarili: false, mesaj: "Kod geçersiz veya süresi dolmuş." });
        }

        await pool.query(
            "UPDATE users SET password = $1, reset_code = NULL, reset_expires = NULL WHERE email = $2",
            [newPassword, email]
        );

        res.json({ basarili: true, mesaj: "Şifreniz başarıyla değiştirildi." });

    } catch (err) {
        res.status(500).json({ basarili: false, mesaj: err.message });
    }
});


// ÜRÜN YÖNETİMİ

// ÜRÜNLERİ LİSTELE
app.get('/urunler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const result = await pool.query(
            "SELECT * FROM products WHERE mandira_code = $1 AND is_active = true ORDER BY id ASC",
            [mandiraCode]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

// TEK ÜRÜN EKLE
app.post('/urun-ekle', upload.single('resim'), async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const { name, price, stock_quantity, unit, critical_level } = req.body;
        const image_url = req.file ? '/uploads/' + req.file.filename : null;

        await pool.query(
            `INSERT INTO products (mandira_code, name, price, stock_quantity, unit, critical_level, image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [mandiraCode, name, price, stock_quantity, unit, critical_level, image_url]
        );

        res.json({ message: "Ürün başarıyla eklendi." });
    } catch (err) { res.status(500).send(err.message); }
});

// ÜRÜN GÜNCELLE
app.put('/urun-guncelle', upload.single('resim'), async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const { id, name, price, stock_quantity, critical_level } = req.body;
        const new_image = req.file ? '/uploads/' + req.file.filename : null;

        await pool.query(
            `UPDATE products 
             SET name = $1, price = $2, stock_quantity = $3, critical_level = $4, image_url = COALESCE($6, image_url)
             WHERE id = $5 AND mandira_code = $7`,
            [name, price, stock_quantity, critical_level, id, new_image, mandiraCode]
        );

        res.json({ message: "Ürün güncellendi." });
    } catch (err) { res.status(500).send(err.message); }
});

// ÜRÜN SİL
app.delete('/urun-sil/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        await pool.query(
            "UPDATE products SET is_active = false WHERE id = $1 AND mandira_code = $2",
            [req.params.id, mandiraCode]
        );
        res.json({ message: "Ürün silindi." });
    } catch (err) { res.status(500).send(err.message); }
});

// EXCEL TOPLU YÜKLEME
app.post('/urunler-toplu-ekle', async (req, res) => {
    const client = await pool.connect();

    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const urunler = req.body;

        console.log(`📥 Excel Yükleme İsteği: ${urunler.length} satır.`);
        if (urunler.length > 0) {
            console.log("🔍 Örnek Satır (İlk Ürün):", urunler[0]);
            console.log("🔑 Sütun Başlıkları:", Object.keys(urunler[0]));
        }

        if (!urunler || urunler.length === 0) {
            return res.status(400).json({ message: "Liste boş." });
        }

        await client.query('BEGIN');
        let sayac = 0;

        for (const u of urunler) {
            const ad = u['Ad'] || u['ad'] || u['AD'] || u['Ürün Adı'] || u['Urun Adi'] || u['name'] || u['Name'];

            if (!ad) {
                console.log("⚠️ Bu satırda 'Ad' bulunamadı, atlanıyor:", u);
                continue;
            }

            const fiyat = parseFloat(u['Fiyat'] || u['fiyat'] || u['Price'] || u['price'] || 0);
            const stok = parseInt(u['Stok'] || u['stok'] || u['Stock'] || u['Miktar'] || 0);
            const kritik = parseInt(u['Kritik'] || u['kritik'] || u['Alarm'] || 10);
            const birim = u['Birim'] || u['birim'] || 'Adet';


            await client.query(
                `INSERT INTO products (mandira_code, name, price, stock_quantity, unit, critical_level)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [mandiraCode, ad, fiyat, stok, birim, kritik]
            );
            sayac++;
        }

        await client.query('COMMIT');

        await logKaydet(userId, `Excel ile ${sayac} ürün yüklendi.`);

        console.log(`✅ İşlem Bitti. Toplam Eklenen: ${sayac}`);
        res.json({ message: `${sayac} ürün başarıyla eklendi.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Excel Hatası:", err);
        res.status(500).json({ message: "Hata: " + err.message });
    } finally { client.release(); }
});


// MÜŞTERİ YÖNETİMİ

// MÜŞTERİLERİ LİSTELE
app.get('/musteriler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const result = await pool.query(
            "SELECT * FROM profiles WHERE role = 'customer' AND mandira_code = $1 ORDER BY created_at DESC",
            [mandiraCode]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

//YENİ MÜŞTERİ EKLE
app.post('/musteri-ekle', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const { name, phone, address, limit, credit_limit, zone } = req.body;

        const sonLimit = limit || credit_limit || 2000;

        await pool.query(
            `INSERT INTO profiles (id, role, mandira_code, name, phone, address, critical_balance, balance, total_paid, zone) 
             VALUES (gen_random_uuid(), 'customer', $1, $2, $3, $4, $5, 0, 0, $6)`,
            [mandiraCode, name, phone, address, sonLimit, zone || 'Merkez']
        );

        await logKaydet(userId, `Yeni müşteri eklendi: ${name} - Bölge: ${zone || 'Merkez'}`);

        res.json({ message: "Müşteri eklendi." });
    } catch (err) {
        console.error("Müşteri Ekleme Hatası:", err);
        res.status(500).send(err.message);
    }
});

//MÜŞTERİ GÜNCELLEME
app.put('/musteri-guncelle', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const { id, name, phone, address, credit_limit, limit, zone } = req.body;

        const yeniLimit = limit || credit_limit || 2000;

        await pool.query(
            `UPDATE profiles 
             SET name=$1, phone=$2, address=$3, critical_balance=$4, zone=$7 
             WHERE id=$5 AND mandira_code=$6 AND role='customer'`,
            [name, phone, address, yeniLimit, id, mandiraCode, zone]
        );

        await logKaydet(userId, `Müşteri güncellendi: ${name}`);
        res.json({ message: "Müşteri güncellendi." });

    } catch (err) {
        console.error("Güncelleme Hatası:", err);
        res.status(500).send(err.message);
    }
});

// MÜŞTERİ SİL
app.delete('/musteri-sil/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        await pool.query(
            "DELETE FROM profiles WHERE id = $1 AND mandira_code = $2 AND role = 'customer'",
            [req.params.id, mandiraCode]
        );
        res.json({ message: "Müşteri silindi." });
    } catch (err) { res.status(500).send(err.message); }
});

//TAHSİLAT YAP
app.post('/tahsilat-yap', async (req, res) => {
    const client = await pool.connect();
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const { musteriId, tutar, odemeTipi } = req.body;

        await client.query('BEGIN');

        await client.query(
            `INSERT INTO payments (mandira_code, user_id, customer_id, amount, payment_type, description) 
             VALUES ($1, $2, $3, $4, $5, 'Borç Tahsilatı')`,
            [mandiraCode, userId, musteriId, tutar, odemeTipi]
        );

        await client.query(
            `UPDATE profiles 
             SET balance = balance - $1, 
                 total_paid = total_paid + $1,
                 last_payment_date = NOW(), 
                 last_payment_amount = $1 
             WHERE id = $2 AND mandira_code = $3`,
            [tutar, musteriId, mandiraCode]
        );

        await client.query('COMMIT');

        // 3. Loglama
        const m = await client.query("SELECT name FROM profiles WHERE id=$1", [musteriId]);
        const isim = m.rows[0]?.name || "Bilinmiyor";
        await logKaydet(userId, `Tahsilat: ${isim} - ${tutar} TL (${odemeTipi})`);

        res.json({ message: "Tahsilat başarılı." });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(err.message);
    } finally { client.release(); }
});

//SATIŞ VE SİPARİŞLER
app.post('/toplu-satis', async (req, res) => {
    const client = await pool.connect();
    try {
        const userId = getUserId(req);

        const userRes = await client.query("SELECT mandira_code, role FROM profiles WHERE id = $1", [userId]);
        if (userRes.rows.length === 0) throw new Error("Kullanıcı bulunamadı.");

        const mandiraCode = userRes.rows[0].mandira_code;
        const userRole = userRes.rows[0].role;

        let { musteriId, sepet, odemeTipi, limitAsimIzni } = req.body;

        //MÜŞTERİ KONTROLÜ
        if (userRole === 'customer') {
            odemeTipi = 'Veresiye';
            musteriId = userId;
            limitAsimIzni = false;
        }

        if (!musteriId) return res.status(400).json({ message: "Müşteri seçilmedi." });
        if (!sepet || sepet.length === 0) return res.status(400).json({ message: "Sepet boş." });

        let genelToplam = 0;
        let siparisIcerigi = [];

        // 2. Stok ve Fiyat Hesaplama
        for (const item of sepet) {
            const pRes = await client.query("SELECT name, price, stock_quantity, unit FROM products WHERE id = $1 AND mandira_code = $2", [item.id, mandiraCode]);
            const urun = pRes.rows[0];
            if (!urun) throw new Error(`Ürün bulunamadı: ID ${item.id}`);

            if (urun.stock_quantity < item.adet) throw new Error(`${urun.name} yetersiz stok!`);

            const satirToplami = parseFloat(urun.price) * item.adet;
            genelToplam += satirToplami;

            siparisIcerigi.push({
                product_id: item.id,
                name: urun.name,
                quantity: item.adet,
                unit: urun.unit,
                price: parseFloat(urun.price),
                total: satirToplami
            });
        }

        let kritikBakiyeAsildi = false;

        //Veresiye Limit Kontrolü
        if (odemeTipi === 'Veresiye') {
            const musRes = await client.query("SELECT balance, critical_balance FROM profiles WHERE id = $1", [musteriId]);
            const mus = musRes.rows[0];
            const sonBakiye = parseFloat(mus.balance) + genelToplam;

            if (sonBakiye > parseFloat(mus.critical_balance)) {
                kritikBakiyeAsildi = true;
            }
        }

        //İŞLEMİ BAŞLAT
        await client.query('BEGIN');

        //Stok ve Fiyat Hesaplama
        for (const item of sepet) {
            const gelenId = item.id || item.product_id || item.urun_id;
            const gelenAdet = Number(item.adet || item.quantity || item.qty || item.amount || item.miktar || 0);

            if (!gelenId) throw new Error("Ürün ID'si bulunamadı!");
            if (gelenAdet <= 0) throw new Error("Ürün adedi geçersiz (0 veya boş)!");

            // Ürünü veritabanından çek
            const pRes = await client.query("SELECT name, price, stock_quantity, unit FROM products WHERE id = $1 AND mandira_code = $2", [gelenId, mandiraCode]);
            const urun = pRes.rows[0];

            if (!urun) throw new Error(`Ürün bulunamadı: ID ${gelenId}`);

            // Stok Yeterli mi?
            if (urun.stock_quantity < gelenAdet) throw new Error(`${urun.name} yetersiz stok!`);

            // Fiyat Hesapla
            const satirToplami = parseFloat(urun.price) * gelenAdet;
            genelToplam += satirToplami;

            siparisIcerigi.push({
                product_id: gelenId,
                name: urun.name,
                quantity: gelenAdet,
                unit: urun.unit,
                price: parseFloat(urun.price),
                total: satirToplami
            });
        }

        const orderRes = await client.query(
            `INSERT INTO orders (mandira_code, user_id, customer_id, total, payment_type, status, items) 
             VALUES ($1, $2, $3, $4, $5, 'Bekliyor', $6) RETURNING id`,
            [mandiraCode, userId, musteriId, genelToplam, odemeTipi, JSON.stringify(siparisIcerigi)]
        );

        //FİNANSAL GÜNCELLEME
        if (odemeTipi === 'Veresiye') {
            await client.query(
                "UPDATE profiles SET balance = balance + $1, last_payment_date=NOW(), last_payment_amount=$1 WHERE id = $2",
                [genelToplam, musteriId]
            );
        } else {

            await client.query(
                "UPDATE profiles SET total_paid = total_paid + $1 WHERE id = $2",
                [genelToplam, musteriId]
            );

            await client.query(
                `INSERT INTO payments (mandira_code, user_id, customer_id, amount, payment_type, description) 
                 VALUES ($1, $2, $3, $4, $5, 'Peşin Satış')`,
                [mandiraCode, userId, musteriId, genelToplam, odemeTipi]
            );
        }

        await client.query('COMMIT');

        // Loglama
        const mLog = await client.query("SELECT name FROM profiles WHERE id=$1", [musteriId]);
        const mAdi = mLog.rows[0]?.name;
        await logKaydet(userId, `Satış: ${mAdi} - Tutar: ${genelToplam} TL (${odemeTipi})`);

        res.json({
            message: "Sipariş tamamlandı.",
            alarm: kritikBakiyeAsildi,
            fisVerisi: {
                tarih: new Date().toLocaleString('tr-TR'),
                siparisNo: orderRes.rows[0].id.substring(0,8),
                toplam: genelToplam,
                sepet: siparisIcerigi
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Satış Hatası:", err.message);
        res.status(500).json({ message: err.message });
    } finally { client.release(); }
});

//SİPARİŞLERİ LİSTELE
app.get('/siparisler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const sql = `
            SELECT 
                o.id as group_id, 
                o.created_at as order_date, 
                COALESCE(p.name, 'Misafir / Silinmiş') as musteri_adi, 
                o.total as total_price, 
                o.status, 
                o.items as icerik
            FROM orders o
            LEFT JOIN profiles p ON o.customer_id = p.id
            WHERE o.mandira_code = $1
            ORDER BY o.created_at DESC
        `;

        const result = await pool.query(sql, [mandiraCode]);
        res.json(result.rows);

    } catch (err) {
        console.error("Sipariş Listeleme Hatası:", err);
        res.status(500).send(err.message);
    }
});


//SİPARİŞ DURUM GÜNCELLEME
app.post('/siparis-durum', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const { groupId, durum, odemeTipi } = req.body;

        const sql = `
            UPDATE orders
            SET status = $1,
                courier_id = $2,
                payment_type = COALESCE($3, payment_type)
            WHERE id = $4 AND mandira_code = $5
        `;

        await pool.query(sql, [durum, userId, odemeTipi || null, groupId, mandiraCode]);

        res.json({ success: true, message: "Sipariş güncellendi" });

    } catch (err) {
        console.error("Durum Güncelleme Hatası:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// MÜŞTERİ GEÇMİŞİ
app.get('/musteri-gecmisi/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const { id } = req.params;

        const musteri = await pool.query(
            "SELECT * FROM profiles WHERE id = $1 AND mandira_code = $2",
            [id, mandiraCode]
        );

        if (musteri.rows.length === 0) {
            return res.status(404).json({ message: "Müşteri bulunamadı." });
        }


        const siparisler = await pool.query(`
            SELECT 
                id as group_id, 
                created_at as order_date, 
                total as total_price, 
                status,
                items as icerik
            FROM orders 
            WHERE customer_id = $1 AND mandira_code = $2
            ORDER BY created_at DESC
        `, [id, mandiraCode]);


        const toplam = await pool.query(
            "SELECT SUM(total) as t FROM orders WHERE customer_id = $1 AND mandira_code = $2",
            [id, mandiraCode]
        );

        res.json({
            bilgi: musteri.rows[0],
            siparisler: siparisler.rows,
            istatistik: {
                toplamHarcama: toplam.rows[0].t || 0,
                guncelBakiye: musteri.rows[0].balance
            }
        });
    } catch (err) {
        console.error("Müşteri Geçmişi Hatası:", err);
        res.status(500).send(err.message);
    }
});


// ANA EKRAN
app.get('/istatistikler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const stok = await pool.query(
            "SELECT SUM(price * stock_quantity) as toplam FROM products WHERE mandira_code=$1 AND is_active=true",
            [mandiraCode]
        );

        const ciro = await pool.query(
            "SELECT SUM(total) as toplam FROM orders WHERE mandira_code=$1 AND status != 'İptal'",
            [mandiraCode]
        );

        const kritik = await pool.query(
            "SELECT COUNT(*) as sayi FROM products WHERE stock_quantity <= critical_level AND mandira_code=$1 AND is_active=true",
            [mandiraCode]
        );

        res.json({
            stok: stok.rows[0].toplam || 0,
            ciro: ciro.rows[0].toplam || 0,
            kritik: kritik.rows[0].sayi || 0
        });

    } catch (err) {
        res.status(500).send(err.message);
    }
});

// GRAFİK VERİLERİ
app.get('/grafik-verileri', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        //Günlük Satışlar (Son 7 Gün)
        const gunluk = await pool.query(`
            SELECT TO_CHAR(created_at, 'DD.MM') as tarih, SUM(total) as ciro 
            FROM orders 
            WHERE mandira_code=$1 AND created_at >= NOW() - INTERVAL '7 days' 
            GROUP BY tarih ORDER BY MIN(created_at)
        `, [mandiraCode]);


        res.json({ gunlukSatislar: gunluk.rows, populerUrunler: [] });
    } catch (err) { res.status(500).send(err.message); }
});

// AKTİVİTE LOGLARI
app.get('/loglar', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const logs = await pool.query(
            "SELECT * FROM activity_logs WHERE mandira_code=$1 ORDER BY created_at DESC LIMIT 50",
            [mandiraCode]
        );
        res.json(logs.rows);
    } catch (err) { res.status(500).send(err.message); }
});


// EXCEL & STOK

// MÜŞTERİ TOPLU YÜKLEME
app.post('/musteriler-toplu-ekle', async (req, res) => {
    const client = await pool.connect();
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const musteriler = req.body;

        if (!musteriler || musteriler.length === 0) {
            return res.status(400).json({ message: "Liste boş." });
        }

        console.log(`📊 Excel Müşteri Yükleme: ${musteriler.length} kişi - Mandıra: ${mandiraCode}`);

        await client.query('BEGIN');
        let sayac = 0;

        for (const m of musteriler) {
            // Excel Başlıklarını Yakala
            const ad = m['Ad'] || m['ad'] || m['Ad Soyad'] || m['Isim'] || m['name'] || m['Name'] || m['Müşteri Adı'];

            if (!ad) {
                console.log("⚠️ İsimsiz satır atlandı:", m);
                continue;
            }

            const tel = m['Telefon'] || m['telefon'] || m['Tel'] || m['Gsm'] || '';
            const adres = m['Adres'] || m['adres'] || '';
            const limit = parseFloat(m['Limit'] || m['limit'] || m['Kredi'] || 2000);

            await client.query(
                `INSERT INTO profiles (id, role, mandira_code, name, phone, address, critical_balance, balance) 
                 VALUES (gen_random_uuid(), 'customer', $1, $2, $3, $4, $5, 0)`,
                [mandiraCode, ad, tel, adres, limit]
            );
            sayac++;
        }

        await client.query('COMMIT');

        await client.query(
            "INSERT INTO activity_logs (user_id, mandira_code, message) VALUES ($1, $2, $3)",
            [userId, mandiraCode, `Excel ile ${sayac} müşteri yüklendi.`]
        );

        res.json({ message: `${sayac} müşteri başarıyla eklendi.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("🔥 Excel Hatası:", err);
        res.status(500).json({ message: "Hata: " + err.message });
    } finally { client.release(); }
});

// HIZLI STOK EKLEME
app.post('/stok-artir', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const { id, miktar } = req.body;

        const eklenecek = parseInt(miktar);
        if (isNaN(eklenecek) || eklenecek <= 0) {
            return res.status(400).json({ message: "Geçersiz miktar." });
        }

        await pool.query(
            "UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND mandira_code = $3",
            [eklenecek, id, mandiraCode]
        );


        const u = await pool.query("SELECT name FROM products WHERE id=$1", [id]);
        const urunAdi = u.rows[0]?.name || "Bilinmeyen Ürün";


        await logKaydet(userId, `${urunAdi} stoğu ${eklenecek} adet artırıldı.`);

        res.json({ message: "Stok güncellendi." });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//KURYE ÖZEL: SADECE KENDİ BÖLGESİNDEKİ SİPARİŞLER
app.get('/kurye-siparisleri', async (req, res) => {
    try {
        const userId = getUserId(req);
        const kuryeRes = await pool.query("SELECT zone, mandira_code FROM profiles WHERE id = $1", [userId]);
        if(kuryeRes.rows.length === 0) throw new Error("Kurye bulunamadı");

        const kuryeBolgesi = kuryeRes.rows[0].zone;
        const mandiraCode = kuryeRes.rows[0].mandira_code;

        console.log(`🛵 Kurye Bölgesi: ${kuryeBolgesi} - Siparişler Aranıyor...`);

        const sql = `
            SELECT
                o.id as group_id,
                o.customer_id,
                o.created_at as order_date,
                p.name as musteri_adi,
                p.phone as telefon,
                p.address as adres,
                p.zone as bolge,
                o.total as total_price,
                o.status,
                o.payment_type,  
                o.items as icerik
            FROM orders o
                     JOIN profiles p ON o.customer_id = p.id
            WHERE o.mandira_code = $1
              AND p.zone = $2
              AND o.status IN ('Bekliyor', 'Yolda')
            ORDER BY o.created_at ASC
        `;
        const result = await pool.query(sql, [mandiraCode, kuryeBolgesi]);

        res.json({
            bolge: kuryeBolgesi,
            siparisler: result.rows
        });

    } catch (err) {
        console.error("Kurye Hatası:", err);
        res.status(500).send(err.message);
    }
});
//YENİ KURYE EKLE (ADMİN PANELİNDEN)
app.post('/kurye-ekle', async (req, res) => {
    try {
        const adminId = getUserId(req);
        const mandiraCode = await getMandiraCode(adminId);

        const { username, password, zone, phone } = req.body;

        const check = await pool.query("SELECT * FROM profiles WHERE name = $1", [username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor." });
        }

        await pool.query(
            `INSERT INTO profiles (id, role, mandira_code, name, password, zone, phone, balance, total_paid) 
             VALUES (gen_random_uuid(), 'courier', $1, $2, $3, $4, $5, 0, 0)`,
            [mandiraCode, username, password, zone || 'Merkez', phone]
        );

        await logKaydet(adminId, `Yeni kurye işe alındı: ${username} - Bölge: ${zone}`);

        res.json({ message: "Kurye hesabı başarıyla oluşturuldu." });

    } catch (err) {
        console.error("Kurye Ekleme Hatası:", err);
        res.status(500).send(err.message);
    }
});
//KURYELERİ LİSTELE
app.get('/kuryeler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const sql = `
            SELECT 
                p.id, p.name, p.phone, p.zone, p.balance,
                (SELECT COUNT(*) FROM activity_logs WHERE user_id = p.id) as islem_sayisi
            FROM profiles p
            WHERE p.role = 'courier' AND p.mandira_code = $1
            ORDER BY p.name ASC
        `;

        const result = await pool.query(sql, [mandiraCode]);
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

//BÖLGELERİ GETİR
app.get('/bolgeler', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const result = await pool.query(
            "SELECT * FROM delivery_zones WHERE mandira_code = $1 ORDER BY name ASC",
            [mandiraCode]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

//YENİ BÖLGE EKLE
app.post('/bolge-ekle', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const { name } = req.body;

        if(!name) return res.status(400).json({message: "Bölge adı boş olamaz."});

        const check = await pool.query("SELECT * FROM delivery_zones WHERE mandira_code=$1 AND name=$2", [mandiraCode, name]);
        if(check.rows.length > 0) return res.status(400).json({message: "Bu bölge zaten var."});

        await pool.query(
            "INSERT INTO delivery_zones (mandira_code, name) VALUES ($1, $2)",
            [mandiraCode, name]
        );

        res.json({ message: "Bölge eklendi." });
    } catch (err) { res.status(500).send(err.message); }
});
//KURYE GÜNCELLE
app.put('/kurye-guncelle', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);

        const { id, name, password, zone, phone} = req.body;

        let sql, params;

        if (password && password.trim() !== "") {
            sql = `UPDATE profiles SET name=$1, zone=$2, password=$3, phone=$4 WHERE id=$5 AND mandira_code=$6 AND role='courier'`;
            params = [name, zone, password, phone, id, mandiraCode];
        } else {
            sql = `UPDATE profiles SET name=$1, zone=$2, phone=$3 WHERE id=$4 AND mandira_code=$5 AND role='courier'`;
            params = [name, zone, phone, id, mandiraCode];
        }

        await pool.query(sql, params);

        await logKaydet(userId, `Kurye güncellendi: ${name}`);
        res.json({ message: "Kurye bilgileri güncellendi." });

    } catch (err) { res.status(500).send(err.message); }
});

//KURYE İŞLEM GEÇMİŞİ
app.get('/kurye-loglari/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const kuryeId = req.params.id;
        const result = await pool.query(
            "SELECT * FROM activity_logs WHERE user_id = $1 AND mandira_code = $2 ORDER BY created_at DESC LIMIT 100",
            [kuryeId, mandiraCode]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

//KURYE TESLİMAT DETAYLARI
app.get('/kurye-detayli-gecmis/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const mandiraCode = await getMandiraCode(userId);
        const kuryeId = req.params.id;

        const sql = `
            SELECT 
                o.created_at as tarih,
                p.name as musteri_adi,
                p.zone as bolge,
                o.total as tutar,
                o.payment_type as odeme_tipi,
                o.items as icerik
            FROM orders o
            LEFT JOIN profiles p ON o.customer_id = p.id
            WHERE o.courier_id = $1 
              AND o.mandira_code = $2 
              AND o.status = 'Teslim Edildi'
            ORDER BY o.created_at DESC
            LIMIT 50
        `;

        const result = await pool.query(sql, [kuryeId, mandiraCode]);
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
});

//KURYE KASA RAPORU
app.get('/kurye-kasa-ozeti', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { tarih } = req.query;
        const secilenTarih = tarih || new Date().toISOString().split('T')[0];
        const ciroSql = `
            SELECT COALESCE(SUM(CAST(total AS NUMERIC)), 0) as toplam_ciro, COUNT(id) as adet
            FROM orders
            WHERE courier_id = $1 AND status = 'Teslim Edildi' AND DATE(created_at) = $2
        `;
        const ciroRes = await pool.query(ciroSql, [userId, secilenTarih]);

        const kasaSql = `
            SELECT
                COALESCE(SUM(CASE WHEN LOWER(payment_type) LIKE '%nakit%' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as nakit,
                COALESCE(SUM(CASE WHEN LOWER(payment_type) LIKE '%kart%' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as kart
            FROM payments
            WHERE user_id = $1 AND DATE(created_at) = $2
        `;
        const kasaRes = await pool.query(kasaSql, [userId, secilenTarih]);

        const listeRes = await pool.query(`
            SELECT id, created_at, total, payment_type, items
            FROM orders
            WHERE courier_id = $1 AND status = 'Teslim Edildi' AND DATE(created_at) = $2
            ORDER BY created_at DESC
        `, [userId, secilenTarih]);

        const ciro = parseFloat(ciroRes.rows[0].toplam_ciro);
        const nakit = parseFloat(kasaRes.rows[0].nakit);
        const kart = parseFloat(kasaRes.rows[0].kart);
        const veresiye = Math.max(0, ciro - (nakit + kart));

        res.json({
            tarih: secilenTarih,
            ozet: {
                adet: parseInt(ciroRes.rows[0].adet),
                ciro: ciro.toFixed(2),
                nakit: nakit.toFixed(2),
                kart: kart.toFixed(2),
                veresiye: veresiye.toFixed(2)
            },
            liste: listeRes.rows
        });

    } catch (err) {
        console.error("Kasa Kritik Hata:", err);
        res.status(500).json({ error: "Hesaplama hatası" });
    }
});


// Server'ı Başlat
app.listen(3000, () => console.log("✅ Sunucu Aktif ve Supabase'e Bağlı: http://localhost:3000"));
