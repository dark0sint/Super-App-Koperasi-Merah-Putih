# Salin file ini menjadi .env lalu sesuaikan nilainya sebelum menjalankan server

# Port server berjalan
PORT=4000

# Secret key untuk JWT (WAJIB diganti sebelum production!)
JWT_SECRET=ganti_dengan_kunci_rahasia_yang_sangat_panjang_dan_acak

# Lama token login berlaku
JWT_EXPIRES_IN=7d

# Nama koperasi (dipakai sebagai default profil microsite)
COOP_NAME=Koperasi Desa Merah Putih

# Kredensial akun pengurus (admin) default yang dibuat otomatis saat pertama kali dijalankan
DEFAULT_ADMIN_EMAIL=admin@koperasimerahputih.id
DEFAULT_ADMIN_PASSWORD=Admin123!

# Batas ambang stok menipis (low stock alert) default
LOW_STOCK_THRESHOLD=10
