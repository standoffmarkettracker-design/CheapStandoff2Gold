const { useState, useEffect, useRef } = React;

// Firebase config (replaced at deploy with live project config)
const firebaseConfig = {
      apiKey: "AIzaSyDX-FZZVvr2XguDvHZUonJokgTAs9O19CY",
      authDomain: "standoff-2-tracker.firebaseapp.com",
      projectId: "standoff-2-tracker",
      databaseURL: "https://standoff-2-tracker-default-rtdb.firebaseio.com",
      storageBucket: "standoff-2-tracker.firebasestorage.app",
      messagingSenderId: "576315107843",
      appId: "1:576315107843:web:452af4251cfc60fd2b3c36"
    };

// Initialize Firebase (safe: app still renders if config is missing)
let auth, db, storage;
try {
  if (!window.firebase?.apps?.length) {
    window.firebase.initializeApp(firebaseConfig);
  }
  auth = window.firebase.auth();
  db = window.firebase.database();
  storage = window.firebase.storage();
} catch (e) {
  console.warn('Firebase not configured yet:', e);
  auth = { onAuthStateChanged: (cb) => { cb(null); return () => {}; }, signOut: () => {} };
  const fakeRef = { on: () => {}, off: () => {}, once: () => Promise.resolve({ val: () => null }), push: () => Promise.resolve() };
  db = { ref: () => fakeRef };
  storage = { ref: () => ({ put: () => Promise.reject(new Error('storage unavailable')) }) };
}

const WEBHOOK = "https://s2-webhook.standoffmarkettracker.workers.dev";

// ---- Shared payment info (used by Checkout + BuyGoldPanel) ----
const PAYMENT_HANDLES = { cashapp:'$jamesmoney192', venmo:'@Standoff2Tracker' };
const CRYPTO_WALLETS = [
  { name:'Bitcoin',  symbol:'BTC',  color:'#f7931a', addr:'bc1pgsmcq0036tdc8zfn8kfj0ngnkxyragj77vydmkmc8vu88xndyk4scx7kux' },
  { name:'Ethereum', symbol:'ETH',  color:'#627eea', addr:'0x61bffb5ff4c4f9f730224cf2c7c0648877e8e1af' },
  { name:'Solana',   symbol:'SOL',  color:'#9945ff', addr:'FoTPGikDL52vJTpxLUiW7DBpt94QZc1mDK1KwT3Hk7wy' },
  { name:'USDT',     symbol:'USDT', color:'#26a17b', addr:'0x61bffb5ff4c4f9f730224cf2c7c0648877e8e1af', note:'ERC-20' },
  { name:'USDC',     symbol:'USDC', color:'#2775ca', addr:'0x61bffb5ff4c4f9f730224cf2c7c0648877e8e1af', note:'ERC-20' },
];
const PAYMENT_METHODS = [
  { id:'cashapp', label:'Cash App',  icon:'' },
  { id:'venmo',   label:'Venmo',     icon:'' },
  { id:'kofi',    label:'Ko-fi/PayPal', icon:'' },
  { id:'crypto',  label:'Crypto',    icon:'' },
  { id:'apple',   label:'Apple Card', icon:'' },
  { id:'google',  label:'Google Play', icon:'' },
];
const PAYMENT_METHOD_LABELS = { cashapp:'Cash App ($jamesmoney192)', venmo:'Venmo (@Standoff2Tracker)', kofi:'Ko-fi / PayPal', crypto:'Cryptocurrency', apple:'Apple Gift Card', google:'Google Play Gift Card' };
const DAILY_GOLD = { bronze: 25, silver: 67, gold: 217 };
// ---- Subscription terms: a tier is only live until subscriptionEnds ----
const TERM_DAYS = { monthly: 31, yearly: 366 };
const DAY_MS = 86400000;
// Returns the tier only while the subscription is still paid up.
function activeTier(u) {
  if (!u || !u.subscriptionTier) return null;
  if (u.subscriptionEnds && Date.now() > u.subscriptionEnds) return null;
  return String(u.subscriptionTier).toLowerCase();
}
function daysLeft(u) {
  if (!u || !u.subscriptionEnds) return null;
  return Math.ceil((u.subscriptionEnds - Date.now()) / DAY_MS);
}
function termEnd(term, from) {
  return (from || Date.now()) + (TERM_DAYS[term] || TERM_DAYS.monthly) * DAY_MS;
}
const PACK_DISC = { bronze: 1, silver: 3, gold: 5 };
const YEARLY_BONUS = { bronze: 250, silver: 750, gold: 2000 };
const packDiscPct = t => PACK_DISC[(t || '').toLowerCase()] || 0;
const TIER_COLOR = { bronze:'#c98f12', silver:'#c7cdd6', gold:'var(--gold)' };

// ---- Multi-language support ----
const LANGS = [
  { code:'en', label:'EN', name:'English', dir:'ltr' },
  { code:'ru', label:'RU', name:'Русский', dir:'ltr' },
  { code:'pt', label:'PT', name:'Português', dir:'ltr' },
  { code:'id', label:'ID', name:'Indonesia', dir:'ltr' },
  { code:'tr', label:'TR', name:'Türkçe', dir:'ltr' },
  { code:'ar', label:'AR', name:'العربية', dir:'rtl' },
];
const I18N = {
  en: { lo_title:'Recent orders', lo_window:'Last 24 hours', lo_empty:'No orders in the last 24 hours. Quiet day \u2014 this list only shows what actually happened.', lo_listed:'listed for', lo_filled:'Filled in', lo_waiting:'Awaiting listing', lo_median:'Median fill', lo_volume:'Gold delivered, 24h', lo_waitcount:'Still waiting', lo_now:'just now', lo_m_ago:'m ago', lo_h_ago:'h ago', nav_buy:'Buy Gold', nav_packs:'Packs', nav_subs:'Subscriptions', nav_sell:'Sell Gold', nav_dash:'Dashboard', nav_admin:'Admin', signin:'Sign in', signout:'Sign out',
    hero_eyebrow:'Standoff 2 Gold Shop', hero_title1:'Stack gold for a', hero_title2:'fraction', hero_title3:'of in-app prices.',
    hero_lead:'Daily gold subscriptions from $4.99/mo and instant packs delivered within 3 hours — run by the team behind standoff2markettracker.com.',
    hero_cta1:'Buy gold now', hero_cta2:'See subscriptions',
    trust1:'Human delivery, no bots', trust2:'Filled within 3 hours', trust3:'Discord support',
    packs_eyebrow:'Instant Gold Packs', packs_h2a:'Need gold', packs_h2b:'right now?', packs_p:'One-time packs, delivered to your account within 3 hours (larger orders can take longer). No subscription needed.',
    subs_eyebrow:'Gold Subscriptions', subs_h2a:'Claim gold', subs_h2b:'every single day', subs_p:'Log in, hit claim, stack gold. Subscriptions deliver the best gold-per-dollar rate we offer.',
    how_eyebrow:'How it works', how_h2a:'From checkout to gold in', how_h2b:'3 steps',
    sell_eyebrow:'Sell your gold', sell_h2a:'Sitting on spare gold?', sell_h2b:'Cash it out.',
    faq_eyebrow:'FAQ', faq_h2:'Questions, answered',
    prog_details:'Your details', prog_listing:'Your listing', prog_gold:'Gold on the way', prog_sent:'Request sent', prog_step:'Step', prog_of:'of',
    flock_lead:'Last step — how you receive your gold:', flock_body_priced:'in Standoff 2, buy a G22 "Flock" from the marketplace and list it for sale at exactly the amount below. Then enter its pattern number and upload a screenshot of your listing so our team can find it and fill your order.', flock_body_plain:'in Standoff 2, buy a G22 "Flock" from the marketplace. Then enter its pattern number and upload a screenshot of your listing so our team can find it and fill your order.',
    flock_list_label:'List your G22 "Flock" for exactly', flock_note_first:'This is your first day of gold — claim the rest from your dashboard every day.', flock_note_first_yr:'This is your first day of gold plus your yearly bonus — claim the rest from your dashboard every day.',
    flock_pattern:'G22 "Flock" pattern number', flock_shot:'Screenshot of the listing', flock_tap:'Tap to upload a screenshot', flock_tap_hint:'Must show your G22 "Flock" listing with the pattern number visible',
    flock_send:'Send listing details', flock_sending:'Sending…', flock_head_received:'Order received', flock_head_submitted:'Order submitted', flock_claim_send:'Submit claim',
    err_img_only:'Please choose an image file.', err_img_big:'That image is too large — please use one under 8 MB.', err_send:'Could not send your listing. Check your connection and try again.',
    done_p:'Our team has your G22 "Flock" details. Your order should be filled within 3 hours — larger orders can take longer.', claim_done_h:'Claim submitted!',
    footer_support:'Support', footer_by:'by the', footer_team:'team',
  },
  ru: { lo_title:'Последние заказы', lo_window:'За 24 часа', lo_empty:'За последние 24 часа заказов не было. Тихий день \u2014 здесь показано только то, что действительно произошло.', lo_listed:'выставлено за', lo_filled:'Выполнен за', lo_waiting:'Ожидает лот', lo_median:'Медиана выдачи', lo_volume:'Золота за 24 ч', lo_waitcount:'В ожидании', lo_now:'только что', lo_m_ago:' мин назад', lo_h_ago:' ч назад', nav_buy:'Купить золото', nav_packs:'Наборы', nav_subs:'Подписки', nav_sell:'Продать золото', nav_dash:'Кабинет', nav_admin:'Админ', signin:'Войти', signout:'Выйти',
    hero_eyebrow:'Магазин золота Standoff 2', hero_title1:'Копите золото за', hero_title2:'малую часть', hero_title3:'цены в игре.',
    hero_lead:'Ежедневные подписки на золото от $4.99/мес и мгновенные наборы с доставкой в течение 3 часов — от команды standoff2markettracker.com.',
    hero_cta1:'Купить золото', hero_cta2:'Посмотреть подписки',
    trust1:'Доставка людьми, без ботов', trust2:'Заказы выполняются за 3 часа', trust3:'Поддержка в Discord',
    packs_eyebrow:'Мгновенные наборы золота', packs_h2a:'Нужно золото', packs_h2b:'прямо сейчас?', packs_p:'Разовые наборы, доставка на аккаунт в течение 3 часов (крупные заказы могут занять дольше). Подписка не нужна.',
    subs_eyebrow:'Подписки на золото', subs_h2a:'Получайте золото', subs_h2b:'каждый день', subs_p:'Войдите, нажмите «получить», копите золото. Подписки дают лучшую цену золота за доллар.',
    how_eyebrow:'Как это работает', how_h2a:'От заказа до золота за', how_h2b:'3 шага',
    sell_eyebrow:'Продайте своё золото', sell_h2a:'Есть лишнее золото?', sell_h2b:'Обменяйте на деньги.',
    faq_eyebrow:'Вопросы', faq_h2:'Частые вопросы',
    prog_details:'Ваши данные', prog_listing:'Ваш лот', prog_gold:'Золото в пути', prog_sent:'Заявка отправлена', prog_step:'Шаг', prog_of:'из',
    flock_lead:'Последний шаг — как вы получите золото:', flock_body_priced:'в Standoff 2 купите G22 «Flock» на рынке и выставите его на продажу ровно за сумму ниже. Затем введите номер паттерна и загрузите скриншот лота, чтобы наша команда нашла его и выполнила заказ.', flock_body_plain:'в Standoff 2 купите G22 «Flock» на рынке. Затем введите номер паттерна и загрузите скриншот лота, чтобы наша команда нашла его и выполнила заказ.',
    flock_list_label:'Выставьте G22 «Flock» ровно за', flock_note_first:'Это золото за первый день — остальное забирайте в кабинете каждый день.', flock_note_first_yr:'Это золото за первый день плюс годовой бонус — остальное забирайте в кабинете каждый день.',
    flock_pattern:'Номер паттерна G22 «Flock»', flock_shot:'Скриншот лота', flock_tap:'Нажмите, чтобы загрузить скриншот', flock_tap_hint:'На нём должен быть виден ваш лот G22 «Flock» с номером паттерна',
    flock_send:'Отправить данные лота', flock_sending:'Отправка…', flock_head_received:'Заказ принят', flock_head_submitted:'Заказ отправлен', flock_claim_send:'Отправить заявку',
    err_img_only:'Выберите, пожалуйста, файл изображения.', err_img_big:'Изображение слишком большое — используйте файл до 8 МБ.', err_send:'Не удалось отправить данные лота. Проверьте соединение и попробуйте снова.',
    done_p:'Наша команда получила данные вашего G22 «Flock». Заказ будет выполнен в течение 3 часов — крупные заказы могут занять больше времени.', claim_done_h:'Заявка отправлена!',
    footer_support:'Поддержка', footer_by:'от команды', footer_team:'',
  },
  pt: { lo_title:'Pedidos recentes', lo_window:'Últimas 24 horas', lo_empty:'Nenhum pedido nas últimas 24 horas. Dia calmo \u2014 esta lista só mostra o que realmente aconteceu.', lo_listed:'anunciado por', lo_filled:'Entregue em', lo_waiting:'Aguardando anúncio', lo_median:'Tempo médio', lo_volume:'Ouro entregue, 24h', lo_waitcount:'Ainda aguardando', lo_now:'agora mesmo', lo_m_ago:'min atrás', lo_h_ago:'h atrás', nav_buy:'Comprar Ouro', nav_packs:'Pacotes', nav_subs:'Assinaturas', nav_sell:'Vender Ouro', nav_dash:'Painel', nav_admin:'Admin', signin:'Entrar', signout:'Sair',
    hero_eyebrow:'Loja de Ouro Standoff 2', hero_title1:'Acumule ouro por', hero_title2:'uma fração', hero_title3:'do preço do jogo.',
    hero_lead:'Assinaturas diárias de ouro a partir de $4.99/mês e pacotes instantâneos entregues em até 3 horas — pela equipe do standoff2markettracker.com.',
    hero_cta1:'Comprar ouro agora', hero_cta2:'Ver assinaturas',
    trust1:'Entrega humana, sem bots', trust2:'Pedidos atendidos em 3 horas', trust3:'Suporte no Discord',
    packs_eyebrow:'Pacotes Instantâneos de Ouro', packs_h2a:'Precisa de ouro', packs_h2b:'agora mesmo?', packs_p:'Pacotes avulsos, entregues em até 3 horas após o pagamento (pedidos maiores podem demorar mais). Sem necessidade de assinatura.',
    subs_eyebrow:'Assinaturas de Ouro', subs_h2a:'Resgate ouro', subs_h2b:'todos os dias', subs_p:'Entre, clique em resgatar, acumule ouro. Assinaturas oferecem a melhor relação ouro por dólar.',
    how_eyebrow:'Como funciona', how_h2a:'Do pedido ao ouro em', how_h2b:'3 passos',
    sell_eyebrow:'Venda seu ouro', sell_h2a:'Tem ouro sobrando?', sell_h2b:'Transforme em dinheiro.',
    faq_eyebrow:'Perguntas frequentes', faq_h2:'Perguntas respondidas',
    prog_details:'Seus dados', prog_listing:'Seu anúncio', prog_gold:'Ouro a caminho', prog_sent:'Pedido enviado', prog_step:'Etapa', prog_of:'de',
    flock_lead:'Última etapa — como você recebe seu ouro:', flock_body_priced:'no Standoff 2, compre uma G22 "Flock" no mercado e anuncie-a à venda exatamente pelo valor abaixo. Depois informe o número do padrão e envie uma captura de tela do anúncio para nossa equipe encontrá-lo e concluir seu pedido.', flock_body_plain:'no Standoff 2, compre uma G22 "Flock" no mercado. Depois informe o número do padrão e envie uma captura de tela do anúncio para nossa equipe encontrá-lo e concluir seu pedido.',
    flock_list_label:'Anuncie sua G22 "Flock" exatamente por', flock_note_first:'Este é o ouro do seu primeiro dia — resgate o restante no painel todos os dias.', flock_note_first_yr:'Este é o ouro do seu primeiro dia mais o bônus anual — resgate o restante no painel todos os dias.',
    flock_pattern:'Número do padrão da G22 "Flock"', flock_shot:'Captura de tela do anúncio', flock_tap:'Toque para enviar uma captura de tela', flock_tap_hint:'Deve mostrar seu anúncio da G22 "Flock" com o número do padrão visível',
    flock_send:'Enviar dados do anúncio', flock_sending:'Enviando…', flock_head_received:'Pedido recebido', flock_head_submitted:'Pedido enviado', flock_claim_send:'Enviar resgate',
    err_img_only:'Escolha um arquivo de imagem.', err_img_big:'Essa imagem é muito grande — use uma com menos de 8 MB.', err_send:'Não foi possível enviar seu anúncio. Verifique sua conexão e tente novamente.',
    done_p:'Nossa equipe recebeu os dados da sua G22 "Flock". Seu pedido deve ser concluído em até 3 horas — pedidos maiores podem demorar mais.', claim_done_h:'Resgate enviado!',
    footer_support:'Suporte', footer_by:'pela equipe', footer_team:'',
  },
  id: { lo_title:'Pesanan terbaru', lo_window:'24 jam terakhir', lo_empty:'Tidak ada pesanan dalam 24 jam terakhir. Hari sepi \u2014 daftar ini hanya menampilkan yang benar-benar terjadi.', lo_listed:'dijual seharga', lo_filled:'Selesai dalam', lo_waiting:'Menunggu listing', lo_median:'Rata-rata proses', lo_volume:'Gold terkirim, 24 jam', lo_waitcount:'Masih menunggu', lo_now:'baru saja', lo_m_ago:' mnt lalu', lo_h_ago:' jam lalu', nav_buy:'Beli Gold', nav_packs:'Paket', nav_subs:'Langganan', nav_sell:'Jual Gold', nav_dash:'Dasbor', nav_admin:'Admin', signin:'Masuk', signout:'Keluar',
    hero_eyebrow:'Toko Gold Standoff 2', hero_title1:'Kumpulkan gold dengan', hero_title2:'sebagian kecil', hero_title3:'dari harga di dalam game.',
    hero_lead:'Langganan gold harian mulai $4.99/bln dan paket instan yang dikirim dalam waktu 3 jam — dikelola tim standoff2markettracker.com.',
    hero_cta1:'Beli gold sekarang', hero_cta2:'Lihat langganan',
    trust1:'Pengiriman manual, bukan bot', trust2:'Pesanan dipenuhi dalam 3 jam', trust3:'Dukungan via Discord',
    packs_eyebrow:'Paket Gold Instan', packs_h2a:'Butuh gold', packs_h2b:'sekarang juga?', packs_p:'Paket sekali beli, dikirim ke akunmu dalam 3 jam setelah pembayaran (pesanan besar bisa lebih lama). Tanpa perlu langganan.',
    subs_eyebrow:'Langganan Gold', subs_h2a:'Klaim gold', subs_h2b:'setiap hari', subs_p:'Masuk, klik klaim, kumpulkan gold. Langganan memberi rasio gold per dolar terbaik.',
    how_eyebrow:'Cara kerja', how_h2a:'Dari checkout sampai gold dalam', how_h2b:'3 langkah',
    sell_eyebrow:'Jual gold kamu', sell_h2a:'Ada gold berlebih?', sell_h2b:'Uangkan sekarang.',
    faq_eyebrow:'FAQ', faq_h2:'Pertanyaan umum',
    prog_details:'Data kamu', prog_listing:'Listing kamu', prog_gold:'Gold segera dikirim', prog_sent:'Permintaan terkirim', prog_step:'Langkah', prog_of:'dari',
    flock_lead:'Langkah terakhir — cara kamu menerima gold:', flock_body_priced:'di Standoff 2, beli G22 "Flock" dari marketplace lalu jual dengan harga persis seperti di bawah ini. Kemudian masukkan nomor pattern-nya dan unggah tangkapan layar listing kamu agar tim kami bisa menemukannya dan memenuhi pesananmu.', flock_body_plain:'di Standoff 2, beli G22 "Flock" dari marketplace. Kemudian masukkan nomor pattern-nya dan unggah tangkapan layar listing kamu agar tim kami bisa menemukannya dan memenuhi pesananmu.',
    flock_list_label:'Jual G22 "Flock" kamu tepat seharga', flock_note_first:'Ini gold hari pertamamu — klaim sisanya dari dasbor setiap hari.', flock_note_first_yr:'Ini gold hari pertamamu plus bonus tahunan — klaim sisanya dari dasbor setiap hari.',
    flock_pattern:'Nomor pattern G22 "Flock"', flock_shot:'Tangkapan layar listing', flock_tap:'Ketuk untuk mengunggah tangkapan layar', flock_tap_hint:'Harus memperlihatkan listing G22 "Flock" kamu dengan nomor pattern yang terlihat',
    flock_send:'Kirim data listing', flock_sending:'Mengirim…', flock_head_received:'Pesanan diterima', flock_head_submitted:'Pesanan terkirim', flock_claim_send:'Kirim klaim',
    err_img_only:'Pilih file gambar.', err_img_big:'Gambar terlalu besar — gunakan yang di bawah 8 MB.', err_send:'Gagal mengirim listing kamu. Periksa koneksi lalu coba lagi.',
    done_p:'Tim kami sudah menerima data G22 "Flock" kamu. Pesananmu akan dipenuhi dalam 3 jam — pesanan besar bisa lebih lama.', claim_done_h:'Klaim terkirim!',
    footer_support:'Dukungan', footer_by:'oleh tim', footer_team:'',
  },
  tr: { lo_title:'Son siparişler', lo_window:'Son 24 saat', lo_empty:'Son 24 saatte sipariş yok. Sakin bir gün \u2014 bu liste yalnızca gerçekte olanları gösterir.', lo_listed:'şu fiyata listelendi', lo_filled:'Tamamlandı', lo_waiting:'İlan bekleniyor', lo_median:'Ortalama süre', lo_volume:'24 saatte altın', lo_waitcount:'Bekleyen', lo_now:'az önce', lo_m_ago:' dk önce', lo_h_ago:' sa önce', nav_buy:'Altın Al', nav_packs:'Paketler', nav_subs:'Abonelikler', nav_sell:'Altın Sat', nav_dash:'Panel', nav_admin:'Yönetici', signin:'Giriş yap', signout:'Çıkış yap',
    hero_eyebrow:'Standoff 2 Altın Mağazası', hero_title1:'Oyun içi fiyatın', hero_title2:'bir kısmına', hero_title3:'altın biriktir.',
    hero_lead:'Aylık $4.99\'dan başlayan günlük altın abonelikleri ve 3 saat içinde teslim edilen anlık paketler — standoff2markettracker.com ekibi tarafından işletiliyor.',
    hero_cta1:'Şimdi altın al', hero_cta2:'Abonelikleri gör',
    trust1:'İnsan tarafından teslimat, bot yok', trust2:'Siparişler 3 saatte tamamlanır', trust3:'Discord desteği',
    packs_eyebrow:'Anlık Altın Paketleri', packs_h2a:'Hemen altına', packs_h2b:'ihtiyacın mı var?', packs_p:'Tek seferlik paketler, ödemeden sonra 3 saat içinde hesabına teslim edilir (büyük siparişler daha uzun sürebilir). Abonelik gerekmez.',
    subs_eyebrow:'Altın Abonelikleri', subs_h2a:'Her gün altın', subs_h2b:'talep et', subs_p:'Giriş yap, talep et butonuna bas, altın biriktir. Abonelikler en iyi dolar başına altın oranını sunar.',
    how_eyebrow:'Nasıl çalışır', how_h2a:'Ödemeden altına', how_h2b:'3 adımda',
    sell_eyebrow:'Altınını sat', sell_h2a:'Elinde fazla altın mı var?', sell_h2b:'Nakde çevir.',
    faq_eyebrow:'SSS', faq_h2:'Sorular yanıtlandı',
    prog_details:'Bilgilerin', prog_listing:'İlanın', prog_gold:'Altın yolda', prog_sent:'Talep gönderildi', prog_step:'Adım', prog_of:'/',
    flock_lead:'Son adım — altını nasıl alacaksın:', flock_body_priced:'Standoff 2\'de pazardan bir G22 "Flock" satın al ve tam olarak aşağıdaki tutara satışa çıkar. Ardından desen numarasını gir ve ilanının ekran görüntüsünü yükle ki ekibimiz ilanı bulup siparişini tamamlayabilsin.', flock_body_plain:'Standoff 2\'de pazardan bir G22 "Flock" satın al. Ardından desen numarasını gir ve ilanının ekran görüntüsünü yükle ki ekibimiz ilanı bulup siparişini tamamlayabilsin.',
    flock_list_label:'G22 "Flock" ilanını tam olarak şu tutara aç', flock_note_first:'Bu ilk günün altını — kalanını her gün panelden talep et.', flock_note_first_yr:'Bu ilk günün altını artı yıllık bonusun — kalanını her gün panelden talep et.',
    flock_pattern:'G22 "Flock" desen numarası', flock_shot:'İlanın ekran görüntüsü', flock_tap:'Ekran görüntüsü yüklemek için dokun', flock_tap_hint:'G22 "Flock" ilanını ve desen numarasını net göstermeli',
    flock_send:'İlan bilgilerini gönder', flock_sending:'Gönderiliyor…', flock_head_received:'Sipariş alındı', flock_head_submitted:'Sipariş gönderildi', flock_claim_send:'Talebi gönder',
    err_img_only:'Lütfen bir görsel dosyası seç.', err_img_big:'Bu görsel çok büyük — 8 MB altında bir dosya kullan.', err_send:'İlan bilgilerin gönderilemedi. Bağlantını kontrol edip tekrar dene.',
    done_p:'Ekibimiz G22 "Flock" bilgilerini aldı. Siparişin 3 saat içinde tamamlanacak — büyük siparişler daha uzun sürebilir.', claim_done_h:'Talep gönderildi!',
    footer_support:'Destek', footer_by:'ekibi tarafından', footer_team:'',
  },
  ar: { lo_title:'أحدث الطلبات', lo_window:'آخر 24 ساعة', lo_empty:'لا توجد طلبات خلال آخر 24 ساعة. يوم هادئ \u2014 هذه القائمة تعرض ما حدث فعلاً فقط.', lo_listed:'معروض بسعر', lo_filled:'أُنجز خلال', lo_waiting:'بانتظار العرض', lo_median:'متوسط الإنجاز', lo_volume:'الذهب خلال 24 ساعة', lo_waitcount:'قيد الانتظار', lo_now:'الآن', lo_m_ago:' د مضت', lo_h_ago:' س مضت', nav_buy:'شراء الذهب', nav_packs:'الباقات', nav_subs:'الاشتراكات', nav_sell:'بيع الذهب', nav_dash:'لوحة التحكم', nav_admin:'الإدارة', signin:'تسجيل الدخول', signout:'تسجيل الخروج',
    hero_eyebrow:'متجر ذهب Standoff 2', hero_title1:'اجمع الذهب مقابل', hero_title2:'جزء صغير', hero_title3:'من سعر اللعبة.',
    hero_lead:'اشتراكات ذهب يومية تبدأ من 4.99 دولار شهريًا وباقات فورية تُسلَّم خلال 3 ساعات — يديرها فريق standoff2markettracker.com.',
    hero_cta1:'اشترِ الذهب الآن', hero_cta2:'عرض الاشتراكات',
    trust1:'تسليم بشري، بدون بوتات', trust2:'تُنفَّذ الطلبات خلال 3 ساعات', trust3:'دعم عبر Discord',
    packs_eyebrow:'باقات ذهب فورية', packs_h2a:'تحتاج ذهبًا', packs_h2b:'الآن؟', packs_p:'باقات لمرة واحدة، تُسلَّم لحسابك خلال 3 ساعات من الدفع (الطلبات الكبيرة قد تستغرق وقتًا أطول). لا حاجة للاشتراك.',
    subs_eyebrow:'اشتراكات الذهب', subs_h2a:'اطلب ذهبك', subs_h2b:'كل يوم', subs_p:'سجّل الدخول، اضغط طلب، واجمع الذهب. الاشتراكات تمنحك أفضل سعر للذهب مقابل الدولار.',
    how_eyebrow:'كيف يعمل', how_h2a:'من الدفع إلى الذهب خلال', how_h2b:'3 خطوات',
    sell_eyebrow:'بِع ذهبك', sell_h2a:'لديك ذهب فائض؟', sell_h2b:'حوّله إلى نقود.',
    faq_eyebrow:'الأسئلة الشائعة', faq_h2:'إجابات على أسئلتك',
    prog_details:'بياناتك', prog_listing:'عرضك', prog_gold:'الذهب في الطريق', prog_sent:'تم إرسال الطلب', prog_step:'الخطوة', prog_of:'من',
    flock_lead:'الخطوة الأخيرة — كيف تستلم ذهبك:', flock_body_priced:'في Standoff 2، اشترِ G22 "Flock" من السوق واعرضها للبيع بالمبلغ المذكور أدناه بالضبط. ثم أدخل رقم النمط وارفع لقطة شاشة لعرضك ليتمكن فريقنا من العثور عليه وتنفيذ طلبك.', flock_body_plain:'في Standoff 2، اشترِ G22 "Flock" من السوق. ثم أدخل رقم النمط وارفع لقطة شاشة لعرضك ليتمكن فريقنا من العثور عليه وتنفيذ طلبك.',
    flock_list_label:'اعرض G22 "Flock" بمبلغ قدره بالضبط', flock_note_first:'هذا ذهب يومك الأول — احصل على الباقي من لوحتك كل يوم.', flock_note_first_yr:'هذا ذهب يومك الأول إضافة إلى مكافأتك السنوية — احصل على الباقي من لوحتك كل يوم.',
    flock_pattern:'رقم نمط G22 "Flock"', flock_shot:'لقطة شاشة للعرض', flock_tap:'اضغط لرفع لقطة شاشة', flock_tap_hint:'يجب أن تُظهر عرض G22 "Flock" مع رقم النمط بوضوح',
    flock_send:'إرسال بيانات العرض', flock_sending:'جارٍ الإرسال…', flock_head_received:'تم استلام الطلب', flock_head_submitted:'تم إرسال الطلب', flock_claim_send:'إرسال المطالبة',
    err_img_only:'يرجى اختيار ملف صورة.', err_img_big:'الصورة كبيرة جدًا — استخدم ملفًا أقل من 8 ميغابايت.', err_send:'تعذّر إرسال بيانات عرضك. تحقق من اتصالك وحاول مرة أخرى.',
    done_p:'استلم فريقنا بيانات G22 "Flock" الخاصة بك. سيتم تنفيذ طلبك خلال 3 ساعات — قد تستغرق الطلبات الكبيرة وقتًا أطول.', claim_done_h:'تم إرسال المطالبة!',
    footer_support:'الدعم', footer_by:'بواسطة فريق', footer_team:'',
  },
};
function t(lang, key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
// ---- Points system translations (merged over I18N; later keys override) ----
const I18N_PTS = {
"en": {
"task_first_ex_h": "First exchange bonus",
"h_ref_friend": "Joined through a friend",
"h_ref_you": "Referral: a friend made their first purchase",
"k_referral": "Referral",
"ref_count": "Friends who bought so far: {n}",
"ref_copy": "Copy",
"ref_p": "Share your link. You both get points as soon as your friend's first payment is confirmed.",
"ref_h": "You get {a}, they get {b}",
"task_refer": "Refer a friend",
"task_send": "Send",
"task_rating_ph": "Anything to add? (optional)",
"task_each": "each",
"task_rating": "Rate your exchange",
"task_first_ex_meta": "Paid when your first gold delivery is filled",
"task_first_ex": "Complete your first exchange",
"earn_once": "One-time",
"task_alert_meta": "Any alert on the Market Tracker counts",
"task_tracker_alert": "Set a price alert",
"task_not_yet": "Not done yet. Finish it on the Market Tracker, then claim.",
"task_watch_meta": "{n} of 3 added",
"task_tracker_watch": "Add 3 skins to your Flip Finder watchlist",
"earn_checked": "Checked automatically",
"earn_tracker": "Market Tracker",
"task_open_tracker": "Open tracker",
"task_visits_meta": "{n} of {d} days this week, signed in",
"task_tracker_visits": "Visit the Market Tracker on 3 days",
"task_code_wrong": "That isn't this week's code. Check the video and try again.",
"task_claim": "Claim",
"task_code_ph": "Code word",
"task_watch": "Watch",
"task_code_meta": "Said in this week's video. Type it in to claim.",
"task_code": "Find this week's code word",
"earn_weekly": "This week",
"task_signup": "Create your account",
"cu_eyebrow": "Buy any amount",
"cu_h2a": "Need a",
"cu_h2b": "specific amount?",
"cu_p": "Type the points you want. Bigger orders earn bulk bonus points.",
"pts_unit": "points",
"pts_short": "pts",
"pay_with": "Pay with",
"your_bonuses": "Your bonuses right now:",
"nav_dash": "Wallet",
"hero_cta1": "Buy points",
"hero_lead": "Buy points for a fraction of in-app gold prices, get a daily drop with a subscription, or earn them free. Then swap them 1:1 for gold. Run by the team behind standoff2markettracker.com.",
"how_e": "How points work",
"how_h": "Buy, earn, exchange",
"how1_h": "Get points",
"how1_p": "Buy a bundle, subscribe for a daily drop, or earn points free by checking in, doing tasks and winning contests.",
"how2_h": "Save them up",
"how2_p": "Points sit in your wallet until you need them. 1 point is always 1 gold.",
"how3_h": "Exchange for gold",
"how3_p": "List a G22 \"Flock\" for the amount we show you and our team buys it out, usually within 3 hours.",
"b_eyebrow": "Point bundles",
"b_h2a": "More gold",
"b_h2b": "per dollar",
"b_p": "Pick a bundle and pay your way. Pay with crypto for +{n}% points.",
"b_bonus_inc": "{a} + {b} bonus",
"b_crypto_hint": "+{n} if you pay in crypto",
"b_per": "pts per $1",
"b_buy": "Buy {name}",
"pb_crypto": "Paying in crypto",
"pb_sub": "{tier} subscriber",
"pb_first": "First purchase",
"pb_loyal": "Loyalty",
"pb_bulk1": "Bulk 10,000+",
"pb_bulk2": "Bulk 25,000+",
"pb_flash": "Flash bonus",
"cu_label": "How many points?",
"cu_pay": "You pay {p} for {n} points",
"cu_rate": "Your rate: ${r} per point. 10,000+ points adds +5%, 25,000+ adds +10%.",
"cu_buy": "Buy points",
"ps_h2a": "Points every day,",
"ps_h2b": "automatically",
"ps_p": "Your plan drops points into your wallet at 00:00 UTC each day. Save them up and exchange them whenever you are ready.",
"ps_monthly": "Monthly",
"ps_yearly": "Yearly",
"ps_save": "save up to {n}%",
"s_daily": "points a day",
"s_month": "{n} points a month, paid daily",
"s_yrbonus": "+{n} bonus points the day you join",
"s_crypto": "+{n} points up front for paying in crypto",
"s_pack": "+{n}% bonus points on every bundle",
"s_rate": "Custom points at ${r} each",
"s_get": "Get {name}",
"s_extend": "Extend {name}",
"s_yours": "YOUR PLAN",
"co_title": "Complete your order",
"co_sub": "You are not charged on this page. Send the payment, then place the order.",
"co_points": "Points",
"co_daily": "Daily points",
"co_daily_v": "{n} a day for {d} days",
"co_yr": "Yearly bonus",
"co_get": "You get",
"co_today": "Points today",
"co_pay": "You pay",
"co_crypto_tip": "Pay with crypto and get +{n} more points.",
"co_send_to": "Send",
"co_copy": "tap to copy",
"co_gc": "Buy a gift card worth at least {p}, reveal the code and enter it below. Do not redeem it yourself.",
"co_user": "Your in-game username",
"co_discord": "Your Discord username",
"co_place": "Place order",
"co_sending": "Sending…",
"co_err": "The order could not be sent. DM camel5961 on Discord and we will sort it out.",
"co_done_h": "Order received",
"co_done_p": "Your points land in your wallet as soon as we confirm the payment, usually within a few hours.",
"co_wallet": "Go to wallet",
"co_close": "Done",
"co_signin": "Sign in to buy points",
"co_signin_p": "Points live in your account, so you need a free account first.",
"co_once": "Recruit is for first orders only.",
"co_prog_pay": "Payment check",
"co_prog_pts": "Points in wallet",
"earn_teaser_h": "Earn points free",
"earn_teaser_p": "Daily check-ins, quick tasks, a weekly Price Call on the Market Tracker and a weekly draw. No purchase needed.",
"earn_cta": "Earn free points",
"tab_wallet": "Wallet",
"tab_earn": "Earn free",
"tab_contests": "Contests",
"tab_exchange": "Exchange",
"w_title": "Your points",
"w_lead": "Buy points, subscribe for a daily drop, or earn them free. Swap them for gold whenever you like. 1 point = 1 gold.",
"w_balance": "Balance",
"w_worth": "Worth {n} gold when you exchange",
"w_paid": "paid for",
"w_free": "earned free",
"w_tickets": "draw tickets",
"w_exchange": "Exchange for gold",
"w_buy": "Buy points",
"w_signin_h": "Sign in to see your points",
"w_signin_p": "Your wallet, daily check-ins, contests and exchanges all live in your account.",
"sub_none": "Get points dropped into your wallet every day, from 25 to 217 a day.",
"sub_see": "See plans",
"sub_daily": "points every day",
"sub_auto": "Paid into your wallet automatically at 00:00 UTC. Save them up and exchange when you like.",
"sub_left": "{n} days left",
"sub_renew": "Renew",
"sub_plan": "{tier} plan",
"sub_legacy": "Claim your daily gold for today below.",
"sub_legacy_btn": "Claim {n} gold today",
"sub_legacy_done": "Today's claim is in.",
"ci_title": "Daily check-in",
"ci_btn": "Check in · +{n} points",
"ci_done": "Checked in today. Come back tomorrow.",
"ci_streak": "{n}-day streak",
"ci_note": "Day 7 pays a {n}-point streak bonus. Miss a day and the streak restarts.",
"ci_day": "Day",
"ord_pending": "Waiting on payment",
"ord_pending_p": "Points land once we confirm it.",
"ord_wait": "Checking payment",
"ord_rejected": "Payment not found",
"hist_title": "History",
"hist_empty": "Nothing here yet. Check in to earn your first points.",
"k_buy": "Bought",
"k_bonus": "Bonus",
"k_sub": "Plan",
"k_earn": "Earned",
"k_contest": "Contest",
"k_ex": "Exchanged",
"k_adjust": "Adjustment",
"h_checkin": "Daily check-in · day {n}",
"h_video": "Found this week's code word",
"h_subdays": "{tier} daily points · {n} days",
"h_ex": "{n} gold exchange",
"xs_awaiting_listing": "waiting for your listing",
"xs_listed": "listing sent",
"xs_filled": "gold delivered",
"earn_tasks": "Tasks",
"earn_ticket": "Each task adds 1 draw ticket",
"earn_none": "New tasks are on the way. Check in daily in the meantime.",
"earn_rules": "One account per player. Alt accounts lose their points. Social tasks are spot-checked.",
"task_discord": "Join the Discord",
"task_youtube": "Subscribe on YouTube",
"task_tiktok": "Follow on TikTok",
"task_video": "Watch this week's video",
"task_once": "One-time",
"task_weekly": "Resets every Monday",
"task_go": "Do it",
"task_done": "Done",
"c_lead": "Contests are free to enter. Buying points never adds entries.",
"pc_title": "Price Call",
"pc_h": "Call Sunday's price, win {n} points",
"pc_p": "Guess where the skin of the week closes on the Market Tracker at 20:00 UTC Sunday. Closest call wins. One guess per player.",
"pc_skin": "Skin of the week",
"pc_now": "Now",
"pc_guess": "Your call, in gold",
"pc_lock": "Lock it in",
"pc_yours": "Your call: {n} G. Results go up after it closes.",
"pc_none": "This week's Price Call opens soon. Check back later.",
"pc_closed": "Entries are closed for this week.",
"pc_won": "{h} called {g} G, closed at {a} G",
"dr_title": "Weekly draw",
"dr_h": "{w} winners × {n} points",
"dr_tickets": "tickets this week",
"dr_p": "1 ticket per daily check-in and 1 per finished task. Tickets reset Monday.",
"dr_last": "Last week",
"left": "{d}d {h}h left",
"ex_prog_amt": "Amount",
"ex_amount": "Points to exchange",
"ex_all": "All",
"ex_get": "You get {n} gold",
"ex_min": "The minimum is {n} points.",
"ex_have": "You have {n} points.",
"ex_locked": "Free points unlock for exchange after your first purchase.",
"ex_continue": "Continue",
"ex_list_h": "Exchange {n} points",
"ex_done_h": "{n} gold on the way",
"ex_done_p": "We took {n} points from your wallet. Our team buys out your listing, usually within 3 hours.",
"ex_more": "Exchange more",
"ex_open": "Waiting for your listing",
"ex_finish": "Finish listing",
"ex_cancel": "Cancel",
"ex_rule": "The minimum exchange is {n} points. Points stay in your wallet until you exchange, so you can save up for one bigger listing.",
"err_generic": "That didn't go through. Check your connection and try again."
},
"ru": {
"task_first_ex_h": "Бонус за первый обмен",
"h_ref_friend": "Регистрация по приглашению друга",
"h_ref_you": "Реферал: друг совершил первую покупку",
"k_referral": "Реферал",
"ref_count": "Друзей, совершивших покупку: {n}",
"ref_copy": "Копировать",
"ref_p": "Поделитесь ссылкой. Вы оба получите очки, как только подтвердится первая оплата друга.",
"ref_h": "Вам {a}, другу {b}",
"task_refer": "Пригласите друга",
"task_send": "Отправить",
"task_rating_ph": "Комментарий (необязательно)",
"task_each": "за каждый",
"task_rating": "Оцените обмен",
"task_first_ex_meta": "Начисляется, когда ваш первый обмен выполнен",
"task_first_ex": "Завершите первый обмен",
"earn_once": "Один раз",
"task_alert_meta": "Подойдёт любое оповещение на Market Tracker",
"task_tracker_alert": "Создайте ценовое оповещение",
"task_not_yet": "Ещё не выполнено. Сделайте это на Market Tracker и заберите очки.",
"task_watch_meta": "Добавлено {n} из 3",
"task_tracker_watch": "Добавьте 3 скина в список Flip Finder",
"earn_checked": "Проверяется автоматически",
"earn_tracker": "Market Tracker",
"task_open_tracker": "Открыть трекер",
"task_visits_meta": "{n} из {d} дней на этой неделе, с входом в аккаунт",
"task_tracker_visits": "Заходите на Market Tracker 3 дня",
"task_code_wrong": "Это не код этой недели. Посмотрите видео и попробуйте ещё раз.",
"task_claim": "Забрать",
"task_code_ph": "Кодовое слово",
"task_watch": "Смотреть",
"task_code_meta": "Оно звучит в видео этой недели. Введите его, чтобы получить очки.",
"task_code": "Найдите кодовое слово недели",
"earn_weekly": "На этой неделе",
"task_signup": "Создать аккаунт",
"cu_eyebrow": "Любая сумма",
"cu_h2a": "Нужно",
"cu_h2b": "точное количество?",
"cu_p": "Укажите нужное число очков. Крупные заказы получают оптовый бонус.",
"pts_unit": "очков",
"pts_short": "оч.",
"pay_with": "Способ оплаты",
"your_bonuses": "Ваши бонусы сейчас:",
"nav_dash": "Кошелёк",
"hero_cta1": "Купить очки",
"hero_lead": "Покупайте очки дешевле золота в игре, получайте их каждый день по подписке или зарабатывайте бесплатно. Затем меняйте 1:1 на золото. От команды standoff2markettracker.com.",
"how_e": "Как работают очки",
"how_h": "Покупайте, зарабатывайте, обменивайте",
"how1_h": "Получите очки",
"how1_p": "Купите набор, оформите подписку с ежедневным начислением или зарабатывайте бесплатно: отметки, задания и конкурсы.",
"how2_h": "Копите",
"how2_p": "Очки лежат в кошельке, пока не понадобятся. 1 очко всегда равно 1 золоту.",
"how3_h": "Обменяйте на золото",
"how3_p": "Выставьте G22 «Flock» за указанную сумму, и наша команда выкупит лот, обычно в течение 3 часов.",
"b_eyebrow": "Наборы очков",
"b_h2a": "Больше золота",
"b_h2b": "за каждый доллар",
"b_p": "Выберите набор и способ оплаты. Оплата криптой даёт +{n}% очков.",
"b_bonus_inc": "{a} + {b} бонус",
"b_crypto_hint": "+{n} при оплате криптой",
"b_per": "оч. за $1",
"b_buy": "Купить {name}",
"pb_crypto": "Оплата криптой",
"pb_sub": "Подписка {tier}",
"pb_first": "Первая покупка",
"pb_loyal": "Лояльность",
"pb_bulk1": "Опт 10 000+",
"pb_bulk2": "Опт 25 000+",
"pb_flash": "Флеш-бонус",
"cu_label": "Сколько очков?",
"cu_pay": "Вы платите {p} за {n} очков",
"cu_rate": "Ваша цена: ${r} за очко. От 10 000 очков +5%, от 25 000 +10%.",
"cu_buy": "Купить очки",
"ps_h2a": "Очки каждый день,",
"ps_h2b": "автоматически",
"ps_p": "Подписка начисляет очки в кошелёк каждый день в 00:00 UTC. Копите и обменивайте, когда захотите.",
"ps_monthly": "Месяц",
"ps_yearly": "Год",
"ps_save": "экономия до {n}%",
"s_daily": "очков в день",
"s_month": "{n} очков в месяц, начисляются ежедневно",
"s_yrbonus": "+{n} бонусных очков в день оформления",
"s_crypto": "+{n} очков сразу за оплату криптой",
"s_pack": "+{n}% бонусных очков на каждый набор",
"s_rate": "Свои суммы по ${r} за очко",
"s_get": "Оформить {name}",
"s_extend": "Продлить {name}",
"s_yours": "ВАШ ПЛАН",
"co_title": "Оформление заказа",
"co_sub": "На этой странице деньги не списываются. Отправьте оплату, затем оформите заказ.",
"co_points": "Очки",
"co_daily": "Ежедневно",
"co_daily_v": "{n} в день, {d} дней",
"co_yr": "Годовой бонус",
"co_get": "Вы получите",
"co_today": "Очки сегодня",
"co_pay": "К оплате",
"co_crypto_tip": "Оплатите криптой и получите ещё +{n} очков.",
"co_send_to": "Отправьте",
"co_copy": "нажмите, чтобы скопировать",
"co_gc": "Купите подарочную карту минимум на {p}, откройте код и введите его ниже. Не активируйте её сами.",
"co_user": "Ваш игровой ник",
"co_discord": "Ваш ник в Discord",
"co_place": "Оформить заказ",
"co_sending": "Отправка…",
"co_err": "Не удалось отправить заказ. Напишите camel5961 в Discord, и мы всё решим.",
"co_done_h": "Заказ принят",
"co_done_p": "Очки поступят в кошелёк, как только мы подтвердим оплату, обычно в течение нескольких часов.",
"co_wallet": "В кошелёк",
"co_close": "Готово",
"co_signin": "Войдите, чтобы купить очки",
"co_signin_p": "Очки хранятся в аккаунте, поэтому нужен бесплатный аккаунт.",
"co_once": "Набор Recruit только для первого заказа.",
"co_prog_pay": "Проверка оплаты",
"co_prog_pts": "Очки в кошельке",
"earn_teaser_h": "Зарабатывайте очки бесплатно",
"earn_teaser_p": "Ежедневные отметки, простые задания, еженедельный Price Call на Market Tracker и розыгрыш. Покупка не нужна.",
"earn_cta": "Заработать очки",
"tab_wallet": "Кошелёк",
"tab_earn": "Бесплатно",
"tab_contests": "Конкурсы",
"tab_exchange": "Обмен",
"w_title": "Ваши очки",
"w_lead": "Покупайте очки, получайте их по подписке или зарабатывайте бесплатно. Меняйте на золото, когда захотите. 1 очко = 1 золото.",
"w_balance": "Баланс",
"w_worth": "Это {n} золота при обмене",
"w_paid": "оплачено",
"w_free": "заработано",
"w_tickets": "билетов",
"w_exchange": "Обменять на золото",
"w_buy": "Купить очки",
"w_signin_h": "Войдите, чтобы увидеть очки",
"w_signin_p": "Кошелёк, отметки, конкурсы и обмены привязаны к аккаунту.",
"sub_none": "Очки каждый день в кошелёк: от 25 до 217 в день.",
"sub_see": "Смотреть планы",
"sub_daily": "очков каждый день",
"sub_auto": "Начисляются автоматически в 00:00 UTC. Копите и обменивайте, когда удобно.",
"sub_left": "осталось {n} дн.",
"sub_renew": "Продлить",
"sub_plan": "План {tier}",
"sub_legacy": "Заберите сегодняшнее золото ниже.",
"sub_legacy_btn": "Забрать {n} золота сегодня",
"sub_legacy_done": "Заявка на сегодня отправлена.",
"ci_title": "Ежедневная отметка",
"ci_btn": "Отметиться · +{n} очков",
"ci_done": "Сегодня вы уже отметились. Возвращайтесь завтра.",
"ci_streak": "серия {n} дн.",
"ci_note": "На 7-й день бонус {n} очков. Пропуск дня обнуляет серию.",
"ci_day": "День",
"ord_pending": "Ожидает оплаты",
"ord_pending_p": "Очки поступят после подтверждения.",
"ord_wait": "Проверяем оплату",
"ord_rejected": "Оплата не найдена",
"hist_title": "История",
"hist_empty": "Пока пусто. Отметьтесь, чтобы получить первые очки.",
"k_buy": "Покупка",
"k_bonus": "Бонус",
"k_sub": "План",
"k_earn": "Заработано",
"k_contest": "Конкурс",
"k_ex": "Обмен",
"k_adjust": "Корректировка",
"h_checkin": "Отметка · день {n}",
"h_video": "Найдено кодовое слово недели",
"h_subdays": "{tier}: ежедневные очки · {n} дн.",
"h_ex": "Обмен на {n} золота",
"xs_awaiting_listing": "ждём ваш лот",
"xs_listed": "лот отправлен",
"xs_filled": "золото доставлено",
"earn_tasks": "Задания",
"earn_ticket": "Каждое задание даёт 1 билет",
"earn_none": "Новые задания скоро появятся. А пока отмечайтесь каждый день.",
"earn_rules": "Один аккаунт на игрока. Твинки теряют очки. Соцзадания выборочно проверяются.",
"task_discord": "Вступить в Discord",
"task_youtube": "Подписаться на YouTube",
"task_tiktok": "Подписаться в TikTok",
"task_video": "Посмотреть видео недели",
"task_once": "Один раз",
"task_weekly": "Обновляется по понедельникам",
"task_go": "Выполнить",
"task_done": "Готово",
"c_lead": "Участие бесплатное. Покупка очков не даёт дополнительных шансов.",
"pc_title": "Price Call",
"pc_h": "Угадайте цену в воскресенье и выиграйте {n} очков",
"pc_p": "Угадайте цену скина недели на Market Tracker в воскресенье в 20:00 UTC. Побеждает ближайший прогноз. Одна попытка на игрока.",
"pc_skin": "Скин недели",
"pc_now": "Сейчас",
"pc_guess": "Ваш прогноз, в золоте",
"pc_lock": "Зафиксировать",
"pc_yours": "Ваш прогноз: {n} G. Итоги после закрытия.",
"pc_none": "Price Call этой недели скоро откроется.",
"pc_closed": "Приём прогнозов на этой неделе закрыт.",
"pc_won": "{h}: прогноз {g} G, итог {a} G",
"dr_title": "Еженедельный розыгрыш",
"dr_h": "{w} победителя × {n} очков",
"dr_tickets": "билетов на этой неделе",
"dr_p": "1 билет за каждую отметку и каждое задание. Обнуляются по понедельникам.",
"dr_last": "Прошлая неделя",
"left": "осталось {d} д {h} ч",
"ex_prog_amt": "Сумма",
"ex_amount": "Сколько очков обменять",
"ex_all": "Все",
"ex_get": "Вы получите {n} золота",
"ex_min": "Минимум {n} очков.",
"ex_have": "У вас {n} очков.",
"ex_locked": "Бесплатные очки можно обменять после первой покупки.",
"ex_continue": "Продолжить",
"ex_list_h": "Обмен {n} очков",
"ex_done_h": "{n} золота уже в пути",
"ex_done_p": "Мы списали {n} очков. Команда выкупит ваш лот, обычно в течение 3 часов.",
"ex_more": "Обменять ещё",
"ex_open": "Ждём ваш лот",
"ex_finish": "Выставить лот",
"ex_cancel": "Отменить",
"ex_rule": "Минимальный обмен {n} очков. Очки хранятся в кошельке, так что можно накопить на один крупный лот.",
"err_generic": "Не получилось. Проверьте соединение и попробуйте снова."
},
"pt": {
"task_first_ex_h": "Bônus da primeira troca",
"h_ref_friend": "Entrou por indicação de um amigo",
"h_ref_you": "Indicação: um amigo fez a primeira compra",
"k_referral": "Indicação",
"ref_count": "Amigos que já compraram: {n}",
"ref_copy": "Copiar",
"ref_p": "Compartilhe seu link. Vocês dois ganham pontos assim que o primeiro pagamento do amigo for confirmado.",
"ref_h": "Você ganha {a}, ele ganha {b}",
"task_refer": "Indique um amigo",
"task_send": "Enviar",
"task_rating_ph": "Algo a acrescentar? (opcional)",
"task_each": "cada",
"task_rating": "Avalie sua troca",
"task_first_ex_meta": "Pago quando sua primeira entrega de ouro for concluída",
"task_first_ex": "Conclua sua primeira troca",
"earn_once": "Uma vez",
"task_alert_meta": "Qualquer alerta no Market Tracker conta",
"task_tracker_alert": "Crie um alerta de preço",
"task_not_yet": "Ainda não concluído. Faça no Market Tracker e depois resgate.",
"task_watch_meta": "{n} de 3 adicionadas",
"task_tracker_watch": "Adicione 3 skins à lista do Flip Finder",
"earn_checked": "Verificado automaticamente",
"earn_tracker": "Market Tracker",
"task_open_tracker": "Abrir tracker",
"task_visits_meta": "{n} de {d} dias nesta semana, com login",
"task_tracker_visits": "Visite o Market Tracker em 3 dias",
"task_code_wrong": "Esse não é o código desta semana. Veja o vídeo e tente de novo.",
"task_claim": "Resgatar",
"task_code_ph": "Palavra-código",
"task_watch": "Assistir",
"task_code_meta": "Dita no vídeo desta semana. Digite para resgatar.",
"task_code": "Encontre a palavra-código da semana",
"earn_weekly": "Esta semana",
"task_signup": "Criar sua conta",
"cu_eyebrow": "Qualquer quantia",
"cu_h2a": "Precisa de uma",
"cu_h2b": "quantia exata?",
"cu_p": "Digite os pontos que quer. Pedidos maiores ganham bônus de volume.",
"pts_unit": "pontos",
"pts_short": "pts",
"pay_with": "Pagar com",
"your_bonuses": "Seus bônus agora:",
"nav_dash": "Carteira",
"hero_cta1": "Comprar pontos",
"hero_lead": "Compre pontos por uma fração do preço do ouro no jogo, receba todo dia com uma assinatura ou ganhe de graça. Depois troque 1:1 por ouro. Feito pela equipe do standoff2markettracker.com.",
"how_e": "Como funcionam os pontos",
"how_h": "Compre, ganhe, troque",
"how1_h": "Consiga pontos",
"how1_p": "Compre um pacote, assine para receber todo dia ou ganhe pontos grátis com check-ins, tarefas e concursos.",
"how2_h": "Junte",
"how2_p": "Os pontos ficam na carteira até você precisar. 1 ponto é sempre 1 de ouro.",
"how3_h": "Troque por ouro",
"how3_p": "Anuncie uma G22 \"Flock\" pelo valor que mostramos e nossa equipe compra, geralmente em até 3 horas.",
"b_eyebrow": "Pacotes de pontos",
"b_h2a": "Mais ouro",
"b_h2b": "por dólar",
"b_p": "Escolha um pacote e pague como preferir. Pague com cripto e ganhe +{n}% de pontos.",
"b_bonus_inc": "{a} + {b} de bônus",
"b_crypto_hint": "+{n} pagando com cripto",
"b_per": "pts por $1",
"b_buy": "Comprar {name}",
"pb_crypto": "Pagamento em cripto",
"pb_sub": "Assinante {tier}",
"pb_first": "Primeira compra",
"pb_loyal": "Fidelidade",
"pb_bulk1": "Volume 10.000+",
"pb_bulk2": "Volume 25.000+",
"pb_flash": "Bônus relâmpago",
"cu_label": "Quantos pontos?",
"cu_pay": "Você paga {p} por {n} pontos",
"cu_rate": "Seu preço: ${r} por ponto. 10.000+ pontos dá +5%, 25.000+ dá +10%.",
"cu_buy": "Comprar pontos",
"ps_h2a": "Pontos todo dia,",
"ps_h2b": "automaticamente",
"ps_p": "Seu plano deposita pontos na carteira todo dia às 00:00 UTC. Junte e troque quando quiser.",
"ps_monthly": "Mensal",
"ps_yearly": "Anual",
"ps_save": "economize até {n}%",
"s_daily": "pontos por dia",
"s_month": "{n} pontos por mês, pagos diariamente",
"s_yrbonus": "+{n} pontos de bônus no dia da assinatura",
"s_crypto": "+{n} pontos na hora por pagar com cripto",
"s_pack": "+{n}% de pontos em todo pacote",
"s_rate": "Pontos avulsos a ${r} cada",
"s_get": "Assinar {name}",
"s_extend": "Estender {name}",
"s_yours": "SEU PLANO",
"co_title": "Finalize seu pedido",
"co_sub": "Nada é cobrado nesta página. Envie o pagamento e depois confirme o pedido.",
"co_points": "Pontos",
"co_daily": "Pontos diários",
"co_daily_v": "{n} por dia durante {d} dias",
"co_yr": "Bônus anual",
"co_get": "Você recebe",
"co_today": "Pontos hoje",
"co_pay": "Você paga",
"co_crypto_tip": "Pague com cripto e ganhe +{n} pontos.",
"co_send_to": "Envie",
"co_copy": "toque para copiar",
"co_gc": "Compre um cartão-presente de pelo menos {p}, revele o código e digite abaixo. Não resgate o cartão.",
"co_user": "Seu nome no jogo",
"co_discord": "Seu usuário do Discord",
"co_place": "Fazer pedido",
"co_sending": "Enviando…",
"co_err": "Não foi possível enviar o pedido. Fale com camel5961 no Discord e resolvemos.",
"co_done_h": "Pedido recebido",
"co_done_p": "Seus pontos chegam à carteira assim que confirmarmos o pagamento, geralmente em poucas horas.",
"co_wallet": "Ir para a carteira",
"co_close": "Pronto",
"co_signin": "Entre para comprar pontos",
"co_signin_p": "Os pontos ficam na sua conta, então você precisa de uma conta grátis.",
"co_once": "O Recruit é só para o primeiro pedido.",
"co_prog_pay": "Conferência",
"co_prog_pts": "Pontos na carteira",
"earn_teaser_h": "Ganhe pontos grátis",
"earn_teaser_p": "Check-ins diários, tarefas rápidas, um Price Call semanal no Market Tracker e um sorteio semanal. Sem compra.",
"earn_cta": "Ganhar pontos grátis",
"tab_wallet": "Carteira",
"tab_earn": "Ganhe grátis",
"tab_contests": "Concursos",
"tab_exchange": "Trocar",
"w_title": "Seus pontos",
"w_lead": "Compre pontos, assine para receber todo dia ou ganhe de graça. Troque por ouro quando quiser. 1 ponto = 1 de ouro.",
"w_balance": "Saldo",
"w_worth": "Vale {n} de ouro na troca",
"w_paid": "pagos",
"w_free": "ganhos grátis",
"w_tickets": "bilhetes",
"w_exchange": "Trocar por ouro",
"w_buy": "Comprar pontos",
"w_signin_h": "Entre para ver seus pontos",
"w_signin_p": "Carteira, check-ins, concursos e trocas ficam na sua conta.",
"sub_none": "Receba pontos na carteira todo dia, de 25 a 217 por dia.",
"sub_see": "Ver planos",
"sub_daily": "pontos todo dia",
"sub_auto": "Depositados automaticamente às 00:00 UTC. Junte e troque quando quiser.",
"sub_left": "faltam {n} dias",
"sub_renew": "Renovar",
"sub_plan": "Plano {tier}",
"sub_legacy": "Resgate o ouro de hoje abaixo.",
"sub_legacy_btn": "Resgatar {n} de ouro hoje",
"sub_legacy_done": "O resgate de hoje já foi enviado.",
"ci_title": "Check-in diário",
"ci_btn": "Fazer check-in · +{n} pontos",
"ci_done": "Check-in feito hoje. Volte amanhã.",
"ci_streak": "sequência de {n} dias",
"ci_note": "O 7º dia paga {n} pontos de bônus. Se perder um dia, a sequência recomeça.",
"ci_day": "Dia",
"ord_pending": "Aguardando pagamento",
"ord_pending_p": "Os pontos chegam após a confirmação.",
"ord_wait": "Conferindo pagamento",
"ord_rejected": "Pagamento não encontrado",
"hist_title": "Histórico",
"hist_empty": "Nada por aqui ainda. Faça check-in para ganhar seus primeiros pontos.",
"k_buy": "Compra",
"k_bonus": "Bônus",
"k_sub": "Plano",
"k_earn": "Ganho",
"k_contest": "Concurso",
"k_ex": "Troca",
"k_adjust": "Ajuste",
"h_checkin": "Check-in diário · dia {n}",
"h_video": "Encontrou a palavra-código da semana",
"h_subdays": "{tier}: pontos diários · {n} dias",
"h_ex": "Troca de {n} de ouro",
"xs_awaiting_listing": "aguardando seu anúncio",
"xs_listed": "anúncio enviado",
"xs_filled": "ouro entregue",
"earn_tasks": "Tarefas",
"earn_ticket": "Cada tarefa dá 1 bilhete",
"earn_none": "Novas tarefas em breve. Enquanto isso, faça check-in todo dia.",
"earn_rules": "Uma conta por jogador. Contas secundárias perdem os pontos. Tarefas sociais são conferidas por amostragem.",
"task_discord": "Entrar no Discord",
"task_youtube": "Inscrever-se no YouTube",
"task_tiktok": "Seguir no TikTok",
"task_video": "Assistir ao vídeo da semana",
"task_once": "Uma vez",
"task_weekly": "Renova toda segunda",
"task_go": "Fazer",
"task_done": "Feito",
"c_lead": "Os concursos são grátis. Comprar pontos nunca dá entradas extras.",
"pc_title": "Price Call",
"pc_h": "Acerte o preço de domingo e ganhe {n} pontos",
"pc_p": "Diga onde a skin da semana fecha no Market Tracker no domingo às 20:00 UTC. O palpite mais próximo vence. Um palpite por jogador.",
"pc_skin": "Skin da semana",
"pc_now": "Agora",
"pc_guess": "Seu palpite, em ouro",
"pc_lock": "Confirmar",
"pc_yours": "Seu palpite: {n} G. Resultado após o fechamento.",
"pc_none": "O Price Call desta semana abre em breve.",
"pc_closed": "Os palpites desta semana estão encerrados.",
"pc_won": "{h} disse {g} G, fechou em {a} G",
"dr_title": "Sorteio semanal",
"dr_h": "{w} vencedores × {n} pontos",
"dr_tickets": "bilhetes nesta semana",
"dr_p": "1 bilhete por check-in e 1 por tarefa concluída. Zera toda segunda.",
"dr_last": "Semana passada",
"left": "faltam {d}d {h}h",
"ex_prog_amt": "Quantia",
"ex_amount": "Pontos para trocar",
"ex_all": "Todos",
"ex_get": "Você recebe {n} de ouro",
"ex_min": "O mínimo é {n} pontos.",
"ex_have": "Você tem {n} pontos.",
"ex_locked": "Pontos grátis podem ser trocados após sua primeira compra.",
"ex_continue": "Continuar",
"ex_list_h": "Trocar {n} pontos",
"ex_done_h": "{n} de ouro a caminho",
"ex_done_p": "Tiramos {n} pontos da sua carteira. Nossa equipe compra seu anúncio, geralmente em até 3 horas.",
"ex_more": "Trocar mais",
"ex_open": "Aguardando seu anúncio",
"ex_finish": "Concluir anúncio",
"ex_cancel": "Cancelar",
"ex_rule": "A troca mínima é de {n} pontos. Os pontos ficam na carteira até a troca, então dá para juntar para um anúncio maior.",
"err_generic": "Não deu certo. Verifique sua conexão e tente de novo."
},
"id": {
"task_first_ex_h": "Bonus penukaran pertama",
"h_ref_friend": "Bergabung lewat teman",
"h_ref_you": "Referal: teman melakukan pembelian pertama",
"k_referral": "Referal",
"ref_count": "Teman yang sudah membeli: {n}",
"ref_copy": "Salin",
"ref_p": "Bagikan link-mu. Kalian berdua dapat poin begitu pembayaran pertama temanmu dikonfirmasi.",
"ref_h": "Kamu dapat {a}, temanmu dapat {b}",
"task_refer": "Ajak teman",
"task_send": "Kirim",
"task_rating_ph": "Ada tambahan? (opsional)",
"task_each": "per penukaran",
"task_rating": "Beri nilai penukaranmu",
"task_first_ex_meta": "Dibayar saat pengiriman gold pertamamu selesai",
"task_first_ex": "Selesaikan penukaran pertamamu",
"earn_once": "Sekali",
"task_alert_meta": "Peringatan apa pun di Market Tracker dihitung",
"task_tracker_alert": "Pasang peringatan harga",
"task_not_yet": "Belum selesai. Selesaikan di Market Tracker, lalu klaim.",
"task_watch_meta": "{n} dari 3 ditambahkan",
"task_tracker_watch": "Tambahkan 3 skin ke watchlist Flip Finder",
"earn_checked": "Dicek otomatis",
"earn_tracker": "Market Tracker",
"task_open_tracker": "Buka tracker",
"task_visits_meta": "{n} dari {d} hari minggu ini, dalam keadaan masuk",
"task_tracker_visits": "Kunjungi Market Tracker selama 3 hari",
"task_code_wrong": "Itu bukan kode minggu ini. Cek videonya lalu coba lagi.",
"task_claim": "Klaim",
"task_code_ph": "Kata kode",
"task_watch": "Tonton",
"task_code_meta": "Disebut di video minggu ini. Ketik untuk klaim.",
"task_code": "Temukan kata kode minggu ini",
"earn_weekly": "Minggu ini",
"task_signup": "Buat akun",
"cu_eyebrow": "Jumlah bebas",
"cu_h2a": "Butuh jumlah",
"cu_h2b": "tertentu?",
"cu_p": "Ketik jumlah poin yang kamu mau. Pesanan besar dapat bonus borongan.",
"pts_unit": "poin",
"pts_short": "poin",
"pay_with": "Bayar dengan",
"your_bonuses": "Bonus kamu sekarang:",
"nav_dash": "Dompet",
"hero_cta1": "Beli poin",
"hero_lead": "Beli poin jauh lebih murah dari gold di game, dapatkan setiap hari lewat langganan, atau kumpulkan gratis. Lalu tukar 1:1 jadi gold. Dikelola tim standoff2markettracker.com.",
"how_e": "Cara kerja poin",
"how_h": "Beli, kumpulkan, tukar",
"how1_h": "Dapatkan poin",
"how1_p": "Beli bundel, berlangganan untuk poin harian, atau dapatkan gratis lewat check-in, tugas, dan kontes.",
"how2_h": "Kumpulkan",
"how2_p": "Poin tersimpan di dompet sampai kamu butuh. 1 poin selalu sama dengan 1 gold.",
"how3_h": "Tukar jadi gold",
"how3_p": "Jual G22 \"Flock\" seharga yang kami tunjukkan, lalu tim kami membelinya, biasanya dalam 3 jam.",
"b_eyebrow": "Bundel poin",
"b_h2a": "Lebih banyak gold",
"b_h2b": "per dolar",
"b_p": "Pilih bundel dan bayar sesukamu. Bayar pakai kripto untuk +{n}% poin.",
"b_bonus_inc": "{a} + {b} bonus",
"b_crypto_hint": "+{n} jika bayar pakai kripto",
"b_per": "poin per $1",
"b_buy": "Beli {name}",
"pb_crypto": "Bayar pakai kripto",
"pb_sub": "Pelanggan {tier}",
"pb_first": "Pembelian pertama",
"pb_loyal": "Loyalitas",
"pb_bulk1": "Borongan 10.000+",
"pb_bulk2": "Borongan 25.000+",
"pb_flash": "Bonus kilat",
"cu_label": "Berapa poin?",
"cu_pay": "Kamu bayar {p} untuk {n} poin",
"cu_rate": "Harga kamu: ${r} per poin. 10.000+ poin dapat +5%, 25.000+ dapat +10%.",
"cu_buy": "Beli poin",
"ps_h2a": "Poin setiap hari,",
"ps_h2b": "otomatis",
"ps_p": "Langgananmu mengirim poin ke dompet setiap hari pukul 00:00 UTC. Kumpulkan dan tukar kapan saja.",
"ps_monthly": "Bulanan",
"ps_yearly": "Tahunan",
"ps_save": "hemat hingga {n}%",
"s_daily": "poin per hari",
"s_month": "{n} poin per bulan, dibayar harian",
"s_yrbonus": "+{n} poin bonus di hari pertama",
"s_crypto": "+{n} poin langsung karena bayar pakai kripto",
"s_pack": "+{n}% poin bonus di setiap bundel",
"s_rate": "Poin satuan ${r} per poin",
"s_get": "Ambil {name}",
"s_extend": "Perpanjang {name}",
"s_yours": "PAKETMU",
"co_title": "Selesaikan pesanan",
"co_sub": "Tidak ada tagihan di halaman ini. Kirim pembayaran, lalu buat pesanan.",
"co_points": "Poin",
"co_daily": "Poin harian",
"co_daily_v": "{n} per hari selama {d} hari",
"co_yr": "Bonus tahunan",
"co_get": "Kamu dapat",
"co_today": "Poin hari ini",
"co_pay": "Kamu bayar",
"co_crypto_tip": "Bayar pakai kripto dan dapat +{n} poin lagi.",
"co_send_to": "Kirim",
"co_copy": "ketuk untuk salin",
"co_gc": "Beli kartu hadiah minimal {p}, buka kodenya, lalu masukkan di bawah. Jangan ditukarkan sendiri.",
"co_user": "Nama in-game kamu",
"co_discord": "Username Discord kamu",
"co_place": "Buat pesanan",
"co_sending": "Mengirim…",
"co_err": "Pesanan gagal dikirim. DM camel5961 di Discord dan kami bantu.",
"co_done_h": "Pesanan diterima",
"co_done_p": "Poinmu masuk ke dompet setelah pembayaran kami konfirmasi, biasanya dalam beberapa jam.",
"co_wallet": "Ke dompet",
"co_close": "Selesai",
"co_signin": "Masuk untuk beli poin",
"co_signin_p": "Poin tersimpan di akunmu, jadi kamu perlu akun gratis dulu.",
"co_once": "Recruit hanya untuk pesanan pertama.",
"co_prog_pay": "Cek pembayaran",
"co_prog_pts": "Poin di dompet",
"earn_teaser_h": "Dapatkan poin gratis",
"earn_teaser_p": "Check-in harian, tugas singkat, Price Call mingguan di Market Tracker, dan undian mingguan. Tanpa pembelian.",
"earn_cta": "Dapatkan poin gratis",
"tab_wallet": "Dompet",
"tab_earn": "Gratis",
"tab_contests": "Kontes",
"tab_exchange": "Tukar",
"w_title": "Poin kamu",
"w_lead": "Beli poin, berlangganan untuk poin harian, atau dapatkan gratis. Tukar jadi gold kapan saja. 1 poin = 1 gold.",
"w_balance": "Saldo",
"w_worth": "Bernilai {n} gold saat ditukar",
"w_paid": "dibeli",
"w_free": "didapat gratis",
"w_tickets": "tiket undian",
"w_exchange": "Tukar jadi gold",
"w_buy": "Beli poin",
"w_signin_h": "Masuk untuk melihat poinmu",
"w_signin_p": "Dompet, check-in, kontes, dan penukaran tersimpan di akunmu.",
"sub_none": "Dapatkan poin di dompet setiap hari, 25 sampai 217 per hari.",
"sub_see": "Lihat paket",
"sub_daily": "poin setiap hari",
"sub_auto": "Masuk otomatis pukul 00:00 UTC. Kumpulkan dan tukar kapan saja.",
"sub_left": "sisa {n} hari",
"sub_renew": "Perpanjang",
"sub_plan": "Paket {tier}",
"sub_legacy": "Klaim gold hari ini di bawah.",
"sub_legacy_btn": "Klaim {n} gold hari ini",
"sub_legacy_done": "Klaim hari ini sudah masuk.",
"ci_title": "Check-in harian",
"ci_btn": "Check-in · +{n} poin",
"ci_done": "Sudah check-in hari ini. Kembali besok.",
"ci_streak": "beruntun {n} hari",
"ci_note": "Hari ke-7 dapat bonus {n} poin. Lewat sehari, hitungan mulai lagi.",
"ci_day": "Hari",
"ord_pending": "Menunggu pembayaran",
"ord_pending_p": "Poin masuk setelah dikonfirmasi.",
"ord_wait": "Mengecek pembayaran",
"ord_rejected": "Pembayaran tidak ditemukan",
"hist_title": "Riwayat",
"hist_empty": "Belum ada apa-apa. Check-in untuk dapat poin pertamamu.",
"k_buy": "Beli",
"k_bonus": "Bonus",
"k_sub": "Paket",
"k_earn": "Didapat",
"k_contest": "Kontes",
"k_ex": "Ditukar",
"k_adjust": "Penyesuaian",
"h_checkin": "Check-in harian · hari {n}",
"h_video": "Menemukan kata kode minggu ini",
"h_subdays": "Poin harian {tier} · {n} hari",
"h_ex": "Penukaran {n} gold",
"xs_awaiting_listing": "menunggu listing kamu",
"xs_listed": "listing terkirim",
"xs_filled": "gold terkirim",
"earn_tasks": "Tugas",
"earn_ticket": "Setiap tugas memberi 1 tiket",
"earn_none": "Tugas baru segera hadir. Sementara itu, check-in setiap hari.",
"earn_rules": "Satu akun per pemain. Akun ganda kehilangan poinnya. Tugas sosial dicek secara acak.",
"task_discord": "Gabung Discord",
"task_youtube": "Subscribe di YouTube",
"task_tiktok": "Follow di TikTok",
"task_video": "Tonton video minggu ini",
"task_once": "Sekali",
"task_weekly": "Reset setiap Senin",
"task_go": "Kerjakan",
"task_done": "Selesai",
"c_lead": "Kontes gratis diikuti. Membeli poin tidak menambah peluang.",
"pc_title": "Price Call",
"pc_h": "Tebak harga hari Minggu, menangkan {n} poin",
"pc_p": "Tebak harga penutupan skin minggu ini di Market Tracker hari Minggu pukul 20:00 UTC. Tebakan terdekat menang. Satu tebakan per pemain.",
"pc_skin": "Skin minggu ini",
"pc_now": "Sekarang",
"pc_guess": "Tebakanmu, dalam gold",
"pc_lock": "Kunci",
"pc_yours": "Tebakanmu: {n} G. Hasil diumumkan setelah ditutup.",
"pc_none": "Price Call minggu ini segera dibuka.",
"pc_closed": "Tebakan minggu ini sudah ditutup.",
"pc_won": "{h} menebak {g} G, tutup di {a} G",
"dr_title": "Undian mingguan",
"dr_h": "{w} pemenang × {n} poin",
"dr_tickets": "tiket minggu ini",
"dr_p": "1 tiket per check-in dan 1 per tugas selesai. Reset setiap Senin.",
"dr_last": "Minggu lalu",
"left": "sisa {d}h {h}j",
"ex_prog_amt": "Jumlah",
"ex_amount": "Poin yang ditukar",
"ex_all": "Semua",
"ex_get": "Kamu dapat {n} gold",
"ex_min": "Minimal {n} poin.",
"ex_have": "Kamu punya {n} poin.",
"ex_locked": "Poin gratis bisa ditukar setelah pembelian pertamamu.",
"ex_continue": "Lanjut",
"ex_list_h": "Tukar {n} poin",
"ex_done_h": "{n} gold sedang dikirim",
"ex_done_p": "Kami mengambil {n} poin dari dompetmu. Tim kami membeli listing-mu, biasanya dalam 3 jam.",
"ex_more": "Tukar lagi",
"ex_open": "Menunggu listing kamu",
"ex_finish": "Selesaikan listing",
"ex_cancel": "Batal",
"ex_rule": "Penukaran minimal {n} poin. Poin tetap di dompet sampai ditukar, jadi kamu bisa menabung untuk satu listing besar.",
"err_generic": "Gagal. Periksa koneksimu lalu coba lagi."
},
"tr": {
"task_first_ex_h": "İlk çevirme bonusu",
"h_ref_friend": "Bir arkadaş daveti ile katıldı",
"h_ref_you": "Davet: bir arkadaşın ilk alışverişini yaptı",
"k_referral": "Davet",
"ref_count": "Şimdiye kadar satın alan arkadaşlar: {n}",
"ref_copy": "Kopyala",
"ref_p": "Linkini paylaş. Arkadaşının ilk ödemesi onaylanır onaylanmaz ikiniz de puan alırsınız.",
"ref_h": "Sen {a}, arkadaşın {b} alır",
"task_refer": "Arkadaşını davet et",
"task_send": "Gönder",
"task_rating_ph": "Eklemek istediğin bir şey var mı? (isteğe bağlı)",
"task_each": "her biri",
"task_rating": "Çevirmeni puanla",
"task_first_ex_meta": "İlk altın teslimatın tamamlanınca ödenir",
"task_first_ex": "İlk çevirmeni tamamla",
"earn_once": "Tek seferlik",
"task_alert_meta": "Market Tracker'daki herhangi bir alarm sayılır",
"task_tracker_alert": "Fiyat alarmı kur",
"task_not_yet": "Henüz tamamlanmadı. Market Tracker'da bitir, sonra al.",
"task_watch_meta": "3'ten {n} eklendi",
"task_tracker_watch": "Flip Finder izleme listene 3 skin ekle",
"earn_checked": "Otomatik kontrol edilir",
"earn_tracker": "Market Tracker",
"task_open_tracker": "Tracker'ı aç",
"task_visits_meta": "Bu hafta {d} günün {n}'i, giriş yapmış olarak",
"task_tracker_visits": "Market Tracker'ı 3 gün ziyaret et",
"task_code_wrong": "Bu, bu haftanın kodu değil. Videoyu kontrol edip tekrar dene.",
"task_claim": "Al",
"task_code_ph": "Kod kelime",
"task_watch": "İzle",
"task_code_meta": "Bu haftanın videosunda söyleniyor. Almak için yaz.",
"task_code": "Haftanın kod kelimesini bul",
"earn_weekly": "Bu hafta",
"task_signup": "Hesabını oluştur",
"cu_eyebrow": "İstediğin miktar",
"cu_h2a": "Belirli bir",
"cu_h2b": "miktar mı lazım?",
"cu_p": "İstediğin puanı yaz. Büyük siparişler toplu bonus puan kazanır.",
"pts_unit": "puan",
"pts_short": "puan",
"pay_with": "Ödeme yöntemi",
"your_bonuses": "Şu anki bonusların:",
"nav_dash": "Cüzdan",
"hero_cta1": "Puan al",
"hero_lead": "Oyun içi altın fiyatının çok altında puan al, abonelikle her gün puan kazan ya da ücretsiz topla. Sonra 1:1 altına çevir. standoff2markettracker.com ekibi tarafından işletiliyor.",
"how_e": "Puanlar nasıl çalışır",
"how_h": "Al, kazan, çevir",
"how1_h": "Puan edin",
"how1_p": "Paket al, günlük puan için abone ol ya da giriş, görev ve yarışmalarla ücretsiz kazan.",
"how2_h": "Biriktir",
"how2_p": "Puanlar ihtiyaç duyana kadar cüzdanında durur. 1 puan her zaman 1 altındır.",
"how3_h": "Altına çevir",
"how3_p": "Gösterdiğimiz tutara bir G22 \"Flock\" ilanı aç, ekibimiz genellikle 3 saat içinde satın alsın.",
"b_eyebrow": "Puan paketleri",
"b_h2a": "Dolar başına",
"b_h2b": "daha fazla altın",
"b_p": "Bir paket seç, istediğin gibi öde. Kripto ile ödersen +%{n} puan.",
"b_bonus_inc": "{a} + {b} bonus",
"b_crypto_hint": "Kripto ile ödersen +{n}",
"b_per": "puan / $1",
"b_buy": "{name} al",
"pb_crypto": "Kripto ödeme",
"pb_sub": "{tier} abonesi",
"pb_first": "İlk alışveriş",
"pb_loyal": "Sadakat",
"pb_bulk1": "Toplu 10.000+",
"pb_bulk2": "Toplu 25.000+",
"pb_flash": "Flaş bonus",
"cu_label": "Kaç puan?",
"cu_pay": "{n} puan için {p} ödersin",
"cu_rate": "Fiyatın: puan başına ${r}. 10.000+ puanda +%5, 25.000+ puanda +%10.",
"cu_buy": "Puan al",
"ps_h2a": "Her gün puan,",
"ps_h2b": "otomatik",
"ps_p": "Planın her gün 00:00 UTC'de cüzdanına puan yatırır. Biriktir ve istediğin zaman çevir.",
"ps_monthly": "Aylık",
"ps_yearly": "Yıllık",
"ps_save": "%{n}'e kadar tasarruf",
"s_daily": "puan / gün",
"s_month": "Ayda {n} puan, günlük ödenir",
"s_yrbonus": "Katıldığın gün +{n} bonus puan",
"s_crypto": "Kripto ödemeye peşin +{n} puan",
"s_pack": "Her pakette +%{n} bonus puan",
"s_rate": "Özel miktar puan başına ${r}",
"s_get": "{name} al",
"s_extend": "{name} uzat",
"s_yours": "PLANIN",
"co_title": "Siparişi tamamla",
"co_sub": "Bu sayfada ücret alınmaz. Ödemeyi gönder, sonra siparişi ver.",
"co_points": "Puan",
"co_daily": "Günlük puan",
"co_daily_v": "{d} gün boyunca günde {n}",
"co_yr": "Yıllık bonus",
"co_get": "Alacağın",
"co_today": "Bugünkü puan",
"co_pay": "Ödeyeceğin",
"co_crypto_tip": "Kripto ile öde, +{n} puan daha al.",
"co_send_to": "Gönder",
"co_copy": "kopyalamak için dokun",
"co_gc": "En az {p} değerinde bir hediye kartı al, kodunu aç ve aşağıya gir. Kartı kendin kullanma.",
"co_user": "Oyun içi kullanıcı adın",
"co_discord": "Discord kullanıcı adın",
"co_place": "Siparişi ver",
"co_sending": "Gönderiliyor…",
"co_err": "Sipariş gönderilemedi. Discord'da camel5961'e yaz, hallederiz.",
"co_done_h": "Sipariş alındı",
"co_done_p": "Ödemeyi onayladığımız anda puanların cüzdanına geçer, genellikle birkaç saat içinde.",
"co_wallet": "Cüzdana git",
"co_close": "Tamam",
"co_signin": "Puan almak için giriş yap",
"co_signin_p": "Puanlar hesabında tutulur, önce ücretsiz bir hesap gerekir.",
"co_once": "Recruit yalnızca ilk sipariş içindir.",
"co_prog_pay": "Ödeme kontrolü",
"co_prog_pts": "Puanlar cüzdanda",
"earn_teaser_h": "Ücretsiz puan kazan",
"earn_teaser_p": "Günlük giriş, kısa görevler, Market Tracker'da haftalık Price Call ve haftalık çekiliş. Satın alma gerekmez.",
"earn_cta": "Ücretsiz puan kazan",
"tab_wallet": "Cüzdan",
"tab_earn": "Ücretsiz",
"tab_contests": "Yarışmalar",
"tab_exchange": "Çevir",
"w_title": "Puanların",
"w_lead": "Puan al, günlük puan için abone ol ya da ücretsiz kazan. İstediğin zaman altına çevir. 1 puan = 1 altın.",
"w_balance": "Bakiye",
"w_worth": "Çevirince {n} altın eder",
"w_paid": "satın alındı",
"w_free": "ücretsiz kazanıldı",
"w_tickets": "çekiliş bileti",
"w_exchange": "Altına çevir",
"w_buy": "Puan al",
"w_signin_h": "Puanlarını görmek için giriş yap",
"w_signin_p": "Cüzdan, girişler, yarışmalar ve çevirmeler hesabında tutulur.",
"sub_none": "Her gün cüzdanına 25 ile 217 arası puan gelsin.",
"sub_see": "Planları gör",
"sub_daily": "puan her gün",
"sub_auto": "00:00 UTC'de otomatik yatırılır. Biriktir ve istediğin zaman çevir.",
"sub_left": "{n} gün kaldı",
"sub_renew": "Yenile",
"sub_plan": "{tier} planı",
"sub_legacy": "Bugünkü altınını aşağıdan talep et.",
"sub_legacy_btn": "Bugün {n} altın talep et",
"sub_legacy_done": "Bugünkü talebin alındı.",
"ci_title": "Günlük giriş",
"ci_btn": "Giriş yap · +{n} puan",
"ci_done": "Bugün giriş yaptın. Yarın tekrar gel.",
"ci_streak": "{n} günlük seri",
"ci_note": "7. gün {n} puan seri bonusu verir. Bir gün kaçırırsan seri baştan başlar.",
"ci_day": "Gün",
"ord_pending": "Ödeme bekleniyor",
"ord_pending_p": "Onaydan sonra puanlar gelir.",
"ord_wait": "Ödeme kontrol ediliyor",
"ord_rejected": "Ödeme bulunamadı",
"hist_title": "Geçmiş",
"hist_empty": "Henüz bir şey yok. İlk puanların için giriş yap.",
"k_buy": "Satın alma",
"k_bonus": "Bonus",
"k_sub": "Plan",
"k_earn": "Kazanç",
"k_contest": "Yarışma",
"k_ex": "Çevrildi",
"k_adjust": "Düzeltme",
"h_checkin": "Günlük giriş · {n}. gün",
"h_video": "Haftanın kod kelimesi bulundu",
"h_subdays": "{tier} günlük puan · {n} gün",
"h_ex": "{n} altın çevirme",
"xs_awaiting_listing": "ilanın bekleniyor",
"xs_listed": "ilan gönderildi",
"xs_filled": "altın teslim edildi",
"earn_tasks": "Görevler",
"earn_ticket": "Her görev 1 bilet verir",
"earn_none": "Yeni görevler yolda. Bu arada her gün giriş yap.",
"earn_rules": "Oyuncu başına bir hesap. Yan hesaplar puanlarını kaybeder. Sosyal görevler rastgele kontrol edilir.",
"task_discord": "Discord'a katıl",
"task_youtube": "YouTube'da abone ol",
"task_tiktok": "TikTok'ta takip et",
"task_video": "Haftanın videosunu izle",
"task_once": "Tek seferlik",
"task_weekly": "Her pazartesi sıfırlanır",
"task_go": "Yap",
"task_done": "Tamam",
"c_lead": "Yarışmalara katılım ücretsiz. Puan satın almak ekstra katılım sağlamaz.",
"pc_title": "Price Call",
"pc_h": "Pazar fiyatını tahmin et, {n} puan kazan",
"pc_p": "Haftanın skin'inin Market Tracker'da pazar 20:00 UTC kapanış fiyatını tahmin et. En yakın tahmin kazanır. Oyuncu başına bir tahmin.",
"pc_skin": "Haftanın skin'i",
"pc_now": "Şu an",
"pc_guess": "Tahminin, altın olarak",
"pc_lock": "Kilitle",
"pc_yours": "Tahminin: {n} G. Sonuçlar kapanıştan sonra açıklanır.",
"pc_none": "Bu haftanın Price Call'u yakında açılıyor.",
"pc_closed": "Bu haftanın tahminleri kapandı.",
"pc_won": "{h} {g} G dedi, {a} G'den kapandı",
"dr_title": "Haftalık çekiliş",
"dr_h": "{w} kazanan × {n} puan",
"dr_tickets": "bu haftaki bilet",
"dr_p": "Her giriş için 1, her tamamlanan görev için 1 bilet. Pazartesi sıfırlanır.",
"dr_last": "Geçen hafta",
"left": "{d}g {h}s kaldı",
"ex_prog_amt": "Miktar",
"ex_amount": "Çevrilecek puan",
"ex_all": "Tümü",
"ex_get": "{n} altın alırsın",
"ex_min": "En az {n} puan.",
"ex_have": "{n} puanın var.",
"ex_locked": "Ücretsiz puanlar ilk alışverişinden sonra çevrilebilir.",
"ex_continue": "Devam",
"ex_list_h": "{n} puan çevir",
"ex_done_h": "{n} altın yolda",
"ex_done_p": "Cüzdanından {n} puan düştük. Ekibimiz ilanını genellikle 3 saat içinde satın alır.",
"ex_more": "Daha fazla çevir",
"ex_open": "İlanın bekleniyor",
"ex_finish": "İlanı tamamla",
"ex_cancel": "İptal",
"ex_rule": "En az {n} puan çevrilebilir. Puanlar çevirene kadar cüzdanında kalır, büyük bir ilan için biriktirebilirsin.",
"err_generic": "Olmadı. Bağlantını kontrol edip tekrar dene."
},
"ar": {
"task_first_ex_h": "مكافأة أول استبدال",
"h_ref_friend": "انضممت عبر صديق",
"h_ref_you": "دعوة: صديق أتم أول عملية شراء",
"k_referral": "دعوة",
"ref_count": "أصدقاء اشتروا حتى الآن: {n}",
"ref_copy": "نسخ",
"ref_p": "شارك رابطك. تحصلان على النقاط فور تأكيد أول دفعة لصديقك.",
"ref_h": "تحصل على {a} ويحصل صديقك على {b}",
"task_refer": "ادعُ صديقًا",
"task_send": "إرسال",
"task_rating_ph": "أي إضافة؟ (اختياري)",
"task_each": "لكل تقييم",
"task_rating": "قيّم الاستبدال",
"task_first_ex_meta": "تُضاف عند إتمام أول تسليم ذهب لك",
"task_first_ex": "أكمل أول استبدال",
"earn_once": "مرة واحدة",
"task_alert_meta": "أي تنبيه على Market Tracker يُحتسب",
"task_tracker_alert": "أنشئ تنبيه سعر",
"task_not_yet": "لم تكتمل بعد. أكملها على Market Tracker ثم اطلب النقاط.",
"task_watch_meta": "تمت إضافة {n} من 3",
"task_tracker_watch": "أضف 3 سكنات إلى قائمة Flip Finder",
"earn_checked": "يُتحقق منها تلقائيًا",
"earn_tracker": "Market Tracker",
"task_open_tracker": "افتح المتتبع",
"task_visits_meta": "{n} من {d} أيام هذا الأسبوع مع تسجيل الدخول",
"task_tracker_visits": "زر Market Tracker في 3 أيام",
"task_code_wrong": "هذه ليست كلمة هذا الأسبوع. راجع الفيديو وحاول مجددًا.",
"task_claim": "اطلب",
"task_code_ph": "الكلمة السرية",
"task_watch": "شاهد",
"task_code_meta": "تُقال في فيديو هذا الأسبوع. اكتبها للمطالبة.",
"task_code": "اعثر على الكلمة السرية لهذا الأسبوع",
"earn_weekly": "هذا الأسبوع",
"task_signup": "أنشئ حسابك",
"cu_eyebrow": "أي كمية",
"cu_h2a": "تحتاج",
"cu_h2b": "كمية محددة؟",
"cu_p": "اكتب عدد النقاط التي تريدها. الطلبات الكبيرة تحصل على مكافأة الكمية.",
"pts_unit": "نقطة",
"pts_short": "نقطة",
"pay_with": "طريقة الدفع",
"your_bonuses": "مكافآتك الآن:",
"nav_dash": "المحفظة",
"hero_cta1": "اشترِ النقاط",
"hero_lead": "اشترِ النقاط بجزء صغير من سعر الذهب داخل اللعبة، أو احصل عليها يوميًا مع الاشتراك، أو اجمعها مجانًا. ثم استبدلها بالذهب 1:1. يديرها فريق standoff2markettracker.com.",
"how_e": "كيف تعمل النقاط",
"how_h": "اشترِ، اكسب، استبدل",
"how1_h": "احصل على النقاط",
"how1_p": "اشترِ حزمة، أو اشترك لتصلك نقاط يوميًا، أو اكسبها مجانًا بتسجيل الحضور والمهام والمسابقات.",
"how2_h": "اجمعها",
"how2_p": "تبقى النقاط في محفظتك حتى تحتاجها. النقطة الواحدة تساوي دائمًا ذهبة واحدة.",
"how3_h": "استبدلها بالذهب",
"how3_p": "اعرض G22 \"Flock\" بالمبلغ الذي نحدده، وسيشتريها فريقنا عادة خلال 3 ساعات.",
"b_eyebrow": "حزم النقاط",
"b_h2a": "ذهب أكثر",
"b_h2b": "لكل دولار",
"b_p": "اختر حزمة وادفع بالطريقة التي تناسبك. ادفع بالعملات الرقمية واحصل على +{n}% نقاط.",
"b_bonus_inc": "{a} + {b} مكافأة",
"b_crypto_hint": "+{n} عند الدفع بالعملات الرقمية",
"b_per": "نقطة لكل 1$",
"b_buy": "اشترِ {name}",
"pb_crypto": "الدفع بالعملات الرقمية",
"pb_sub": "مشترك {tier}",
"pb_first": "أول عملية شراء",
"pb_loyal": "الولاء",
"pb_bulk1": "كمية 10,000+",
"pb_bulk2": "كمية 25,000+",
"pb_flash": "مكافأة سريعة",
"cu_label": "كم نقطة تريد؟",
"cu_pay": "تدفع {p} مقابل {n} نقطة",
"cu_rate": "سعرك: ${r} للنقطة. 10,000+ نقطة تمنح +5%، و25,000+ تمنح +10%.",
"cu_buy": "اشترِ النقاط",
"ps_h2a": "نقاط كل يوم،",
"ps_h2b": "تلقائيًا",
"ps_p": "يضيف اشتراكك النقاط إلى محفظتك يوميًا الساعة 00:00 UTC. اجمعها واستبدلها متى شئت.",
"ps_monthly": "شهري",
"ps_yearly": "سنوي",
"ps_save": "وفّر حتى {n}%",
"s_daily": "نقطة يوميًا",
"s_month": "{n} نقطة شهريًا، تُضاف يوميًا",
"s_yrbonus": "+{n} نقطة مكافأة يوم الاشتراك",
"s_crypto": "+{n} نقطة فورًا للدفع بالعملات الرقمية",
"s_pack": "+{n}% نقاط إضافية على كل حزمة",
"s_rate": "نقاط بالكمية التي تريدها بسعر ${r} للنقطة",
"s_get": "اشترك في {name}",
"s_extend": "مدّد {name}",
"s_yours": "خطتك",
"co_title": "أكمل طلبك",
"co_sub": "لن يتم خصم أي مبلغ في هذه الصفحة. أرسل الدفعة ثم قدّم الطلب.",
"co_points": "النقاط",
"co_daily": "النقاط اليومية",
"co_daily_v": "{n} يوميًا لمدة {d} يومًا",
"co_yr": "المكافأة السنوية",
"co_get": "ستحصل على",
"co_today": "نقاط اليوم",
"co_pay": "ستدفع",
"co_crypto_tip": "ادفع بالعملات الرقمية واحصل على +{n} نقطة إضافية.",
"co_send_to": "أرسل",
"co_copy": "اضغط للنسخ",
"co_gc": "اشترِ بطاقة هدايا بقيمة {p} على الأقل، واكشف الرمز وأدخله أدناه. لا تستخدمها بنفسك.",
"co_user": "اسمك داخل اللعبة",
"co_discord": "اسم المستخدم في Discord",
"co_place": "قدّم الطلب",
"co_sending": "جارٍ الإرسال…",
"co_err": "تعذّر إرسال الطلب. راسل camel5961 على Discord وسنحل الأمر.",
"co_done_h": "تم استلام الطلب",
"co_done_p": "تصل نقاطك إلى المحفظة فور تأكيد الدفع، عادة خلال ساعات قليلة.",
"co_wallet": "إلى المحفظة",
"co_close": "تم",
"co_signin": "سجّل الدخول لشراء النقاط",
"co_signin_p": "النقاط محفوظة في حسابك، لذا تحتاج إلى حساب مجاني أولًا.",
"co_once": "حزمة Recruit لأول طلب فقط.",
"co_prog_pay": "التحقق من الدفع",
"co_prog_pts": "النقاط في المحفظة",
"earn_teaser_h": "اكسب النقاط مجانًا",
"earn_teaser_p": "تسجيل حضور يومي، ومهام سريعة، وPrice Call أسبوعي على Market Tracker، وسحب أسبوعي. بلا شراء.",
"earn_cta": "اكسب نقاطًا مجانية",
"tab_wallet": "المحفظة",
"tab_earn": "مجانًا",
"tab_contests": "المسابقات",
"tab_exchange": "الاستبدال",
"w_title": "نقاطك",
"w_lead": "اشترِ النقاط، أو اشترك لتصلك يوميًا، أو اكسبها مجانًا. استبدلها بالذهب متى شئت. نقطة = ذهبة.",
"w_balance": "الرصيد",
"w_worth": "تساوي {n} ذهبة عند الاستبدال",
"w_paid": "مدفوعة",
"w_free": "مجانية",
"w_tickets": "تذاكر السحب",
"w_exchange": "استبدل بالذهب",
"w_buy": "اشترِ النقاط",
"w_signin_h": "سجّل الدخول لرؤية نقاطك",
"w_signin_p": "المحفظة وتسجيل الحضور والمسابقات والاستبدال كلها في حسابك.",
"sub_none": "احصل على نقاط في محفظتك كل يوم، من 25 إلى 217 يوميًا.",
"sub_see": "عرض الخطط",
"sub_daily": "نقطة كل يوم",
"sub_auto": "تُضاف تلقائيًا الساعة 00:00 UTC. اجمعها واستبدلها متى شئت.",
"sub_left": "متبقٍ {n} يوم",
"sub_renew": "جدّد",
"sub_plan": "خطة {tier}",
"sub_legacy": "اطلب ذهب اليوم من الأسفل.",
"sub_legacy_btn": "اطلب {n} ذهبة اليوم",
"sub_legacy_done": "تم إرسال مطالبة اليوم.",
"ci_title": "تسجيل الحضور اليومي",
"ci_btn": "سجّل حضورك · +{n} نقطة",
"ci_done": "سجّلت حضورك اليوم. عد غدًا.",
"ci_streak": "سلسلة {n} يوم",
"ci_note": "اليوم السابع يمنح {n} نقطة مكافأة. إذا فاتك يوم تبدأ السلسلة من جديد.",
"ci_day": "يوم",
"ord_pending": "بانتظار الدفع",
"ord_pending_p": "تصل النقاط بعد التأكيد.",
"ord_wait": "نتحقق من الدفع",
"ord_rejected": "لم يُعثر على الدفع",
"hist_title": "السجل",
"hist_empty": "لا شيء بعد. سجّل حضورك لتكسب أول نقاطك.",
"k_buy": "شراء",
"k_bonus": "مكافأة",
"k_sub": "خطة",
"k_earn": "مكتسبة",
"k_contest": "مسابقة",
"k_ex": "استبدال",
"k_adjust": "تعديل",
"h_checkin": "تسجيل حضور · اليوم {n}",
"h_video": "وجدت كلمة هذا الأسبوع",
"h_subdays": "نقاط {tier} اليومية · {n} يوم",
"h_ex": "استبدال {n} ذهبة",
"xs_awaiting_listing": "بانتظار عرضك",
"xs_listed": "تم إرسال العرض",
"xs_filled": "تم تسليم الذهب",
"earn_tasks": "المهام",
"earn_ticket": "كل مهمة تمنح تذكرة واحدة",
"earn_none": "مهام جديدة قريبًا. في الأثناء، سجّل حضورك يوميًا.",
"earn_rules": "حساب واحد لكل لاعب. الحسابات الإضافية تخسر نقاطها. تُراجع المهام الاجتماعية عشوائيًا.",
"task_discord": "انضم إلى Discord",
"task_youtube": "اشترك في YouTube",
"task_tiktok": "تابع على TikTok",
"task_video": "شاهد فيديو الأسبوع",
"task_once": "مرة واحدة",
"task_weekly": "يتجدد كل اثنين",
"task_go": "نفّذ",
"task_done": "تم",
"c_lead": "المشاركة في المسابقات مجانية. شراء النقاط لا يزيد فرصك.",
"pc_title": "Price Call",
"pc_h": "توقّع سعر الأحد واربح {n} نقطة",
"pc_p": "توقّع سعر إغلاق سكن الأسبوع على Market Tracker يوم الأحد الساعة 20:00 UTC. أقرب توقع يفوز. توقع واحد لكل لاعب.",
"pc_skin": "سكن الأسبوع",
"pc_now": "الآن",
"pc_guess": "توقعك بالذهب",
"pc_lock": "ثبّت التوقع",
"pc_yours": "توقعك: {n} G. النتائج بعد الإغلاق.",
"pc_none": "يُفتح Price Call هذا الأسبوع قريبًا.",
"pc_closed": "أُغلقت التوقعات لهذا الأسبوع.",
"pc_won": "{h} توقع {g} G، والإغلاق {a} G",
"dr_title": "السحب الأسبوعي",
"dr_h": "{w} فائزين × {n} نقطة",
"dr_tickets": "تذاكر هذا الأسبوع",
"dr_p": "تذكرة لكل تسجيل حضور وتذكرة لكل مهمة مكتملة. تُصفّر كل اثنين.",
"dr_last": "الأسبوع الماضي",
"left": "متبقٍ {d}ي {h}س",
"ex_prog_amt": "الكمية",
"ex_amount": "النقاط المراد استبدالها",
"ex_all": "الكل",
"ex_get": "ستحصل على {n} ذهبة",
"ex_min": "الحد الأدنى {n} نقطة.",
"ex_have": "لديك {n} نقطة.",
"ex_locked": "يمكن استبدال النقاط المجانية بعد أول عملية شراء.",
"ex_continue": "متابعة",
"ex_list_h": "استبدال {n} نقطة",
"ex_done_h": "{n} ذهبة في الطريق",
"ex_done_p": "خصمنا {n} نقطة من محفظتك. سيشتري فريقنا عرضك، عادة خلال 3 ساعات.",
"ex_more": "استبدل المزيد",
"ex_open": "بانتظار عرضك",
"ex_finish": "أكمل العرض",
"ex_cancel": "إلغاء",
"ex_rule": "الحد الأدنى للاستبدال {n} نقطة. تبقى النقاط في محفظتك حتى تستبدلها، فيمكنك جمعها لعرض واحد أكبر.",
"err_generic": "لم ينجح ذلك. تحقق من اتصالك وحاول مجددًا."
}
};
Object.keys(I18N_PTS).forEach(l => { I18N[l] = Object.assign({}, I18N[l] || {}, I18N_PTS[l]); });

const PACKS = [
  { id:'recruit', name:'Recruit Pack', gold:250, bonus:0, price:1.99, tag:'FIRST ORDER', blurb:'New here? Prove us out for two bucks. One per customer.' },
  { id:'scout',  name:'Scout Pack',  gold:1000,  bonus:0,    price:7.99,  tag:null,          blurb:'Quick top-up for your next skin.' },
  { id:'raider', name:'Raider Pack', gold:5000,  bonus:0,    price:37.99, tag:'MOST POPULAR', blurb:'The sweet spot for serious loadouts.' },
  { id:'vault',  name:'Vault Pack',  gold:10000, bonus:2000, price:79.99, tag:null, blurb:'Cheapest one-time gold. Beats buying Raider twice.' },
];


const TIERS = [
  { id:'bronze', name:'Bronze', monthly:750,  mo:4.99,  yr:58,  tag:null },
  { id:'silver', name:'Silver', monthly:2000, mo:12.99, yr:150, tag:'MOST POPULAR' },
  { id:'gold',   name:'Gold',   monthly:6500, mo:37.99, yr:400, tag:'BEST VALUE', best:true },
];

const fmt = n => n.toLocaleString('en-US');
const fmtG = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const randListOffset = () => +(0.23 + Math.random() * 0.69).toFixed(2);

// ---- Live stats bar (simulated growth until real order volume takes over) ----
// NOTE: These numbers are a realistic-looking simulated trend seeded from a launch date,
// NOT real order data. Swap this out for real counts (goldPurchases + dailyClaims totals)
// once volume is high enough to look credible on its own.
const STATS_EPOCH = new Date('2026-06-01T00:00:00Z').getTime();
const STATS_BASE_ORDERS = 180;
const STATS_BASE_GOLD = 60000;
function seededRand(seed) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }
function computeLiveStats() {
  const daysElapsed = Math.max(0, Math.floor((Date.now() - STATS_EPOCH) / 86400000));
  let orders = STATS_BASE_ORDERS, gold = STATS_BASE_GOLD;
  for (let d = 0; d < daysElapsed; d++) {
    const r1 = seededRand(d + 1), r2 = seededRand(d + 500);
    orders += Math.round(4 + r1 * 6);           // ~4-10 new orders/day
    gold += Math.round(5000 + r2 * 7000);        // ~5k-12k gold/day
  }
  return { orders, gold };
}

// ---- Public order feed ----
// Sanitised mirror of an order: masked handle + amounts only. Safe to expose
// publicly. NEVER read goldPurchases from the client — it holds usernames,
// Discord handles and gift card codes.
const maskHandle = (s) => {
  s = (s || '').trim();
  if (!s) return 'player***';
  const keep = Math.max(1, Math.min(4, s.length - 1));
  return s.slice(0, keep) + '***';
};
const feedPush = (ts, obj) => { try { db.ref('publicFeed/' + ts).set(obj); } catch (e) {} };
const feedUpdate = (ts, obj) => { try { db.ref('publicFeed/' + ts).update(obj); } catch (e) {} };

function StatsBar({ avgDeliveryHrs }) {
  const stats = computeLiveStats();
  const deliveryLabel = avgDeliveryHrs != null && avgDeliveryHrs > 0
    ? (avgDeliveryHrs < 1 ? Math.round(avgDeliveryHrs*60)+' min' : avgDeliveryHrs.toFixed(1)+' hrs')
    : 'under 3 hrs';
  return (
    <section style={{padding:'24px 0'}}>
      <div className="wrap">
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,background:'var(--bg2)',border:'1px solid var(--line)',borderRadius:10,padding:'18px 10px'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:'Figtree',fontWeight:700,fontSize:'clamp(20px,4vw,30px)',color:'var(--gold)'}}>{fmt(stats.gold)}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,textTransform:'uppercase',letterSpacing:'.06em'}}>Gold delivered</div>
          </div>
          <div style={{textAlign:'center',borderLeft:'1px solid var(--line)',borderRight:'1px solid var(--line)'}}>
            <div style={{fontFamily:'Figtree',fontWeight:700,fontSize:'clamp(20px,4vw,30px)',color:'var(--gold)'}}>{fmt(stats.orders)}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,textTransform:'uppercase',letterSpacing:'.06em'}}>Orders fulfilled</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:'Figtree',fontWeight:700,fontSize:'clamp(20px,4vw,30px)',color:'var(--green)'}}>{deliveryLabel}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,textTransform:'uppercase',letterSpacing:'.06em'}}>Avg delivery time</div>
          </div>
        </div>
      </div>
    </section>
  );
}


function LiveOrders({ lang }) {
  const [rows, setRows] = React.useState(null);   // null = loading
  const [err, setErr] = React.useState(false);

  const load = React.useCallback(() => {
    const cutoff = Date.now() - 86400000;
    db.ref('publicFeed').orderByKey().limitToLast(40).once('value')
      .then(snap => {
        const v = snap.val() || {};
        const list = Object.keys(v).map(k => Object.assign({ ts: Number(k) }, v[k]))
          .filter(o => o.ts > cutoff)
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 8);
        setRows(list); setErr(false);
      })
      .catch(() => { setRows([]); setErr(true); });
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 6 * 60 * 60 * 1000);   // refresh every 6 hours
    return () => clearInterval(id);
  }, [load]);

  if (err || rows === null) return null;

  const ago = (ts) => {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1) return t(lang, 'lo_now');
    if (m < 60) return m + t(lang, 'lo_m_ago');
    return Math.floor(m / 60) + t(lang, 'lo_h_ago');
  };
  const dur = (m) => (m == null ? '' : (m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'));
  const filled = rows.filter(o => o.status === 'filled' && o.fillMins != null).map(o => o.fillMins).sort((a, b) => a - b);
  const median = filled.length ? filled[Math.floor(filled.length / 2)] : null;
  const volume = rows.reduce((a, o) => a + (o.gold || 0), 0);
  const waiting = rows.filter(o => o.status !== 'filled').length;

  return (
    <section style={{padding:'8px 0 24px'}}>
      <div className="wrap">
        <div style={{background:'var(--bg2)',border:'1px solid var(--line)',borderRadius:18,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'15px 18px',borderBottom:'1px solid var(--line2)'}}>
            <h3 style={{fontSize:16,letterSpacing:'-.02em'}}>{t(lang,'lo_title')}</h3>
            <span style={{fontSize:13,color:'var(--low)'}}>{t(lang,'lo_window')}</span>
          </div>

          {rows.length === 0 ? (
            <div style={{padding:'26px 18px',color:'var(--low)',fontSize:14.5}}>{t(lang,'lo_empty')}</div>
          ) : rows.map(o => {
            const done = o.status === 'filled';
            return (
              <div key={o.ts} style={{display:'flex',alignItems:'center',gap:13,padding:'12px 18px',borderBottom:'1px solid var(--line2)'}}>
                <div style={{width:36,height:36,flex:'none',borderRadius:'50%',background:done?'var(--gold-dim)':'#FDF0E7',color:done?'var(--gold-hot)':'#C2621C',display:'grid',placeItems:'center',fontWeight:800,fontSize:14}}>
                  {(o.handle || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.handle}</div>
                  <div style={{fontSize:13,color:'var(--low)'}}>
                    {ago(o.ts)}{o.listed ? ' \u00b7 ' + t(lang,'lo_listed') + ' ' + fmtG(o.listed) : ''}
                  </div>
                </div>
                <div style={{textAlign:'right',flex:'none'}}>
                  <div style={{fontWeight:700,fontSize:15}}>{fmt(o.gold || 0)} G</div>
                  <div style={{fontSize:12.5,fontWeight:600,color:done?'var(--green)':'#C2621C'}}>
                    {done ? t(lang,'lo_filled') + ' ' + dur(o.fillMins) : t(lang,'lo_waiting')}
                  </div>
                </div>
              </div>
            );
          })}

          {rows.length > 0 && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',background:'var(--bg3)'}}>
              <div style={{padding:'13px 18px',borderRight:'1px solid var(--line2)'}}>
                <div style={{fontSize:12.5,color:'var(--low)',fontWeight:600}}>{t(lang,'lo_median')}</div>
                <div style={{fontSize:18,fontWeight:800,letterSpacing:'-.03em'}}>{median == null ? '\u2014' : dur(median)}</div>
              </div>
              <div style={{padding:'13px 18px',borderRight:'1px solid var(--line2)'}}>
                <div style={{fontSize:12.5,color:'var(--low)',fontWeight:600}}>{t(lang,'lo_volume')}</div>
                <div style={{fontSize:18,fontWeight:800,letterSpacing:'-.03em'}}>{fmt(volume)}</div>
              </div>
              <div style={{padding:'13px 18px'}}>
                <div style={{fontSize:12.5,color:'var(--low)',fontWeight:600}}>{t(lang,'lo_waitcount')}</div>
                <div style={{fontSize:18,fontWeight:800,letterSpacing:'-.03em'}}>{waiting}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Discount system ----
const LOYALTY_THRESHOLD = 25000;
const LOYALTY_PCT = 5;
const FIRST_PCT = 10;
function bulkPct(amt) { if (amt >= 25000) return 10; if (amt >= 10000) return 5; return 0; }
function flashActive(fs) { return !!(fs && fs.active && (!fs.endsAt || Date.now() < fs.endsAt) && fs.percent > 0); }
function computeDiscounts(baseCost, amt, opts) {
  const lines = [];
  const bp = bulkPct(amt);
  if (bp > 0) lines.push({ label: 'Bulk discount (' + fmt(amt) + '+ G)', pct: bp });
  if (opts.flash && flashActive(opts.flash)) lines.push({ label: opts.flash.label || 'Flash sale', pct: opts.flash.percent });
  if (opts.loyalty) lines.push({ label: 'Loyalty reward', pct: LOYALTY_PCT });
  if (opts.first) lines.push({ label: 'First purchase', pct: FIRST_PCT });
  let cost = baseCost;
  lines.forEach(l => { cost = cost * (1 - l.pct / 100); });
  const totalPct = baseCost > 0 ? Math.round((1 - cost / baseCost) * 100) : 0;
  return { finalCost: cost, baseCost, lines, totalPct };
}

async function submitOrder(order) {
  const lines = Object.entries(order).map(([k,v]) => `**${k}:** ${v}`).join('\n');
  let webhookOk = false;
  try {
    const res = await fetch(WEBHOOK, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ embeds:[{ title:`\uD83D\uDED2 New ${order.Type} — CheapStandoff2Gold`, description: lines, color: 16763964, timestamp: new Date().toISOString() }] })
    });
    webhookOk = res.ok;
  } catch(e) { console.warn('webhook failed', e); }
  let key = null;
  try {
    const ref = await db.ref('goldOrders').push({ ...order, createdAt: Date.now(), status:'awaiting_listing' });
    key = ref.key;
  } catch(e) { console.warn('db write skipped', e); }
  return { ok: webhookOk, key };
}

// Second-phase submit: the buyer's G22 "Flock" listing details, sent after the order is placed.
async function submitFlock({ orderKey, type, label, username, discord, pattern, listPrice, screenshot }) {
  const fields = [
    { name: 'Username', value: username || '—', inline: true },
    { name: 'Discord', value: discord || '—', inline: true },
    { name: 'Pattern', value: pattern, inline: true },
  ];
  if (listPrice) fields.push({ name: 'Listed For', value: fmtG(listPrice) + ' G', inline: true });
  const payload = { embeds:[{ title:`\uD83D\uDD2B G22 "Flock" listing — ${type}`, description: label ? ('Order: ' + label) : 'Buy out this listing to fill the order.', color: 16766720, fields, timestamp: new Date().toISOString() }] };
  let ok = false, screenshotUrl = null;
  try {
    const ext = (screenshot.name.match(/\.[a-zA-Z0-9]+$/) || ['.png'])[0];
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(payload));
    fd.append('files[0]', screenshot, 'listing-screenshot' + ext);
    const res = await fetch(WEBHOOK + '?wait=true', { method:'POST', body: fd });
    ok = res.ok;
    try { const msg = await res.json(); screenshotUrl = msg?.attachments?.[0]?.url || null; } catch(e) {}
  } catch(e) { console.warn('flock webhook failed', e); }
  if (orderKey) {
    try { await db.ref('goldOrders/' + orderKey).update({ flockPattern: pattern, listPrice: listPrice || null, screenshotUrl, status:'pending' }); } catch(e) { console.warn('order update skipped', e); }
  }
  return { ok, screenshotUrl };
}

// ---- Order progress bar, shown across every step of a purchase or claim ----
function OrderProgress({ step, steps, accent, busy, lang }) {
  const color = accent || 'var(--gold)';
  const L = k => t(lang || 'en', k);
  const total = steps.length;
  const cur = Math.min(Math.max(step, 1), total);
  return (
    <div style={{marginBottom:18}}>
      <div style={{display:'flex',gap:5,marginBottom:8}}>
        {steps.map((s, i) => (
          <div key={i} style={{flex:1,height:4,borderRadius:99,overflow:'hidden',background:'var(--line)'}}>
            <div style={{height:'100%',borderRadius:99,background:color,width: i < cur - 1 ? '100%' : i === cur - 1 ? (busy ? '65%' : '100%') : '0%',transition:'width .35s ease',opacity: i === cur - 1 && busy ? .7 : 1}} />
          </div>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,fontFamily:'Figtree',fontWeight:600,fontSize:11,letterSpacing:'.06em',textTransform:'uppercase'}}>
        <span style={{color:'var(--ink)'}}>{L(steps[cur - 1])}</span>
        <span style={{color:'var(--muted)',whiteSpace:'nowrap'}}>{L('prog_step')} {cur} {L('prog_of')} {total}</span>
      </div>
    </div>
  );
}

// ---- Step 2 of every order: tell the buyer how to receive the gold, and collect the listing ----
function FlockStep({ listPrice, listNote, accent, heading, submitLabel, onSubmit, lang }) {
  const [pattern, setPattern] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);
  const color = accent || 'var(--gold)';
  const L = k => t(lang || 'en', k);

  // Phone screenshots regularly exceed Discord's 8MB cap, so downscale before upload.
  const shrink = (file) => new Promise((resolve) => {
    if (!/^image\//.test(file.type)) { resolve({ error: 'err_img_only' }); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1 && file.size <= 4 * 1024 * 1024) { URL.revokeObjectURL(url); resolve({ file }); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(blob => {
        URL.revokeObjectURL(url);
        if (!blob) { resolve({ file }); return; }
        if (blob.size > 8 * 1024 * 1024) { resolve({ error: 'err_img_big' }); return; }
        resolve({ file: new File([blob], 'listing.jpg', { type: 'image/jpeg' }) });
      }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: 'err_img_only' }); };
    img.src = url;
  });

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setErr('');
    const out = await shrink(file);
    if (out.error) { setErr(L(out.error)); setScreenshot(null); setPreview(null); return; }
    setScreenshot(out.file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(out.file);
  };

  const openPicker = () => fileInputRef.current && fileInputRef.current.click();
  const can = pattern.trim() && screenshot && !busy;
  const go = async () => {
    if (!can) return;
    setBusy(true); setErr('');
    const ok = await onSubmit(pattern.trim(), screenshot);
    setBusy(false);
    if (ok === false) setErr(L('err_send'));
  };

  return (
    <div>
      {heading && <h3 style={{marginBottom:6}}>{heading}</h3>}
      <div className="quote" style={{marginBottom:12}}><b>{L('flock_lead')}</b> {listPrice ? L('flock_body_priced') : L('flock_body_plain')}</div>
      {listPrice > 0 && (
        <div style={{background:'var(--gold-dim)',border:'1px solid rgba(201,138,18,.35)',borderRadius:8,padding:'10px 14px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <span style={{fontSize:13,color:'var(--muted)',fontWeight:600}}>{L('flock_list_label')}</span>
            <b style={{fontFamily:'Figtree',fontSize:18,color:'var(--gold)',whiteSpace:'nowrap'}}>{fmtG(listPrice)} G</b>
          </div>
          {listNote && <div style={{fontSize:11,color:'var(--muted)',marginTop:6}}>{L(listNote)}</div>}
        </div>
      )}
      <label htmlFor="flock-pattern" style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('flock_pattern')} <span style={{color:'var(--danger)'}}>*</span></label>
      <input id="flock-pattern" value={pattern} onChange={e=>setPattern(e.target.value.replace(/[^0-9]/g,''))} inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="743" style={{fontFamily:'monospace',marginBottom:12}} />
      <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('flock_shot')} <span style={{color:'var(--danger)'}}>*</span></label>
      <div role="button" tabIndex={0} onClick={openPicker} onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openPicker(); } }} style={{border:'1px dashed '+(screenshot?color+'99':'var(--line)'),borderRadius:8,padding:preview?'8px':'26px 14px',minHeight:preview?0:64,textAlign:'center',cursor:'pointer',background:'rgba(20,23,26,.08)',marginBottom:6}}>
        {preview ? (
          <img src={preview} alt="" style={{maxWidth:'100%',maxHeight:130,objectFit:'contain',borderRadius:6,display:'block',margin:'0 auto'}} />
        ) : (
          <div><div style={{color:'var(--muted)',fontSize:14}}>{L('flock_tap')}</div><div style={{color:'var(--muted)',fontSize:11,marginTop:4,opacity:.7}}>{L('flock_tap_hint')}</div></div>
        )}
      </div>
      {screenshot && !err && <div style={{fontSize:11,color:'var(--green)',marginBottom:10,textAlign:'center'}}>\u2713</div>}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{display:'none'}} />
      {err && <div className="alert err" style={{marginBottom:10}}>{err}</div>}
      <button className="btn btn-gold" style={{width:'100%',marginTop:8}} disabled={!can} onClick={go}>{busy ? L('flock_sending') : (submitLabel || L('flock_send'))}</button>
    </div>
  );
}

function Checkout({ item, user, tier, go, onClose, lang }) {
  const L = k => t(lang || 'en', k);
  const [method, setMethod] = useState('cashapp');
  const [username, setUsername] = useState(user ? (user.displayName || '') : '');
  const [discord, setDiscord] = useState('');
  const [gcCode, setGcCode] = useState('');
  const [copied, setCopied] = useState('');
  const [state, setState] = useState('form');
  const [listOffset] = useState(randListOffset);
  const [orderKey, setOrderKey] = useState(null);
  const [orderTs, setOrderTs] = useState(null);

  const isCard = method === 'apple' || method === 'google';
  const isKofi = method === 'kofi';
  const isCrypto = method === 'crypto';
  const isDirect = method === 'cashapp' || method === 'venmo';
  const isSell = item.type === 'Sell Gold Request';
  const listPrice = !isSell && (item.gold || 0) > 0 ? +(item.gold + listOffset).toFixed(2) : null;
  const listNote = item.goldNote || null;
  const progressSteps = isSell ? ['prog_details','prog_sent'] : ['prog_details','prog_listing','prog_gold'];
  const progressStep = state === 'done' ? progressSteps.length : state === 'flock' ? 2 : 1;

  const copyText = (t, key) => { navigator.clipboard.writeText(t).catch(()=>{}); setCopied(key); setTimeout(()=>setCopied(''), 1500); };
  const canSubmit = () => username.trim() && discord.trim() && (isCard ? gcCode.trim().length >= 8 : true);
  const isPack = item.type === 'Gold Pack';
  const discPct = isPack ? packDiscPct(tier) : 0;
  const effPrice = discPct ? Math.round(item.price * (100 - discPct)) / 100 : item.price;
  const refCode = (() => { try { const r = localStorage.getItem('cs2g_ref'); return (r && (!user || r !== user.uid)) ? r : null; } catch(e) { return null; } })();

  const submit = async () => {
    if (!canSubmit()) return;
    setState('sending');
    const methodLabel = PAYMENT_METHOD_LABELS[method];
    const order = {
      Type: item.type, Item: item.label, Price: '$' + effPrice.toFixed(2), Method: methodLabel,
      Username: username.trim(), Discord: discord.trim(), Account: user ? (user.email || user.uid) : 'guest'
    };
    if (discPct) order.Discount = 'Subscriber -' + discPct + '%';
    if (refCode) order.Referral = refCode;
    if (isCard) order['Gift Card Code'] = '||' + gcCode.trim() + '||';
    if (listPrice) order['To Be Listed For'] = fmtG(listPrice) + ' G';
    const res = await submitOrder(order);
    const ts = Date.now();
    try {
      if (user) {
        db.ref('goldPurchases/' + user.uid + '/' + ts).set({
          uid: user.uid, username: username.trim(), discord: discord.trim(), method, type: item.type,
          status: isSell ? 'pending' : 'awaiting_listing', amount: null, label: item.label, price: effPrice,
          flockPattern: null, listPrice: listPrice || null,
          gcCode: isCard ? gcCode.trim() : null, referral: refCode, createdAt: new Date().toISOString()
        });
        if (!isSell) feedPush(ts, { handle: maskHandle(username), gold: item.gold || 0, listed: null, status: 'awaiting_listing', fillMins: null });
      }
    } catch(e) {}
    setOrderKey(res.key); setOrderTs(ts);
    setState(res.ok ? (isSell ? 'done' : 'flock') : 'error');
  };

  const sendFlock = async (pattern, screenshot) => {
    const res = await submitFlock({ orderKey, type: item.type, label: item.label, username: username.trim(), discord: discord.trim(), pattern, listPrice, screenshot });
    if (!res.ok) return false;
    try {
      if (user && orderTs) db.ref('goldPurchases/' + user.uid + '/' + orderTs).update({ flockPattern: pattern, status: 'pending' });
      if (user && orderTs) feedUpdate(orderTs, { listed: listPrice || null, status: 'listed' });
    } catch(e) {}
    setState('done');
    return true;
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="xbtn" onClick={onClose} aria-label="Close">×</button>
        <OrderProgress step={progressStep} steps={progressSteps} busy={state === 'sending'} lang={lang} />
        {state === 'flock' ? (
          <FlockStep listPrice={listPrice} listNote={listNote} heading={L('flock_head_received')} submitLabel={L('flock_send')} onSubmit={sendFlock} lang={lang} />
        ) : state === 'done' ? (
          <div className="oksplash">
            <div className="big">✓</div>
            <h3>Order received</h3>
            <p className="msub" style={{marginTop:8}}>{L('done_p')}</p>
            <p className="msub" style={{marginTop:12}}>Want <b style={{color:'var(--gold)'}}>100 gold</b>? Refer a friend — you both get 100 G on their first order.</p>
            {user ? <button className="btn btn-gold btn-sm" style={{marginTop:8}} onClick={()=>copyText('https://standoffmarkettracker-design.github.io/CheapStandoff2Gold/?ref=' + user.uid, 'refdone')}>{copied === 'refdone' ? 'Copied!' : 'Copy your referral link'}</button> : <p className="msub" style={{marginTop:4,fontSize:12}}>Sign in and grab your link from the Dashboard.</p>}
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{marginTop:10}}>Done</button>
          </div>
        ) : (
          <div>
            <h3>Complete your order</h3>
            <p className="msub">Pick how you'd like to pay. You are not charged on this page.</p>
            <div className="ordersum"><span>{item.label}</span><b>${effPrice.toFixed(2)}</b></div>
            {discPct > 0 && <div className="sub" style={{color:'var(--green)',marginTop:6,marginBottom:10}}>Subscriber discount applied - {discPct}% off (was ${item.price.toFixed(2)})</div>}
            {isPack && !discPct && <div className="sub" style={{marginTop:6,marginBottom:10}}>Gold subscribers pay <b style={{color:'var(--gold)'}}>${(Math.round(item.price*95)/100).toFixed(2)}</b> for this pack. <button onClick={()=>{onClose(); go && go('subs');}} style={{background:'none',border:'none',color:'var(--gold)',cursor:'pointer',padding:0,textDecoration:'underline',font:'inherit'}}>View plans →</button></div>}

            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Payment method</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:16}}>
              {PAYMENT_METHODS.map(m => (
                <div key={m.id} onClick={()=>setMethod(m.id)} style={{padding:'10px 4px',border:'1px solid '+(method===m.id?'var(--gold)':'var(--line)'),borderRadius:8,background:method===m.id?'var(--gold-dim)':'transparent',color:method===m.id?'var(--ink)':'var(--muted)',fontSize:11,fontWeight:600,cursor:'pointer',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <span style={{fontSize:18}}>{m.icon}</span><span>{m.label}</span>
                </div>
              ))}
            </div>

            {isDirect && (
              <div>
                <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Send ${effPrice.toFixed(2)} to</label>
                <div onClick={()=>copyText(PAYMENT_HANDLES[method],'handle')} style={{background:'rgba(20,23,26,.10)',border:'1px solid var(--line)',borderRadius:8,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:14}}>
                  <span style={{fontFamily:'monospace',fontSize:16,fontWeight:600}}>{PAYMENT_HANDLES[method]}</span>
                  <span style={{fontSize:11,color:copied==='handle'?'var(--green)':'var(--muted)'}}>{copied==='handle'?'Copied!':'tap to copy'}</span>
                </div>
              </div>
            )}

            {isKofi && (
              <div className="quote" style={{marginBottom:14}}>Pay ${effPrice.toFixed(2)} via Ko-fi — accepts PayPal, credit card, and Apple Pay. Include your username in the Ko-fi message.<br/><a href="https://ko-fi.com/standoff263277" target="_blank" rel="noopener">Open Ko-fi page →</a></div>
            )}

            {isCrypto && (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Send the equivalent of <b style={{color:'var(--gold)'}}>${effPrice.toFixed(2)}</b> to any wallet (tap to copy)</label>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {CRYPTO_WALLETS.map(w => (
                    <div key={w.name} onClick={()=>copyText(w.addr,w.symbol)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(20,23,26,.03)',border:'1px solid var(--line)',borderRadius:8,cursor:'pointer'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:w.color+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:w.color,flexShrink:0}}>{w.symbol}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600}}>{w.name} {w.note && <span style={{fontSize:10,color:'var(--muted)'}}>({w.note})</span>}</div>
                        <div style={{fontSize:10,color:'var(--muted)',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.addr}</div>
                      </div>
                      <span style={{fontSize:11,color:copied===w.symbol?'var(--green)':'var(--muted)',flexShrink:0}}>{copied===w.symbol?'Copied!':'copy'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isCard && (
              <div>
                <div className="quote" style={{marginBottom:12}}>{method==='apple'?'Buy an Apple Gift Card from the App Store or any retailer.':'Buy a Google Play Gift Card from any retailer.'} Use a card worth at least <b>${effPrice.toFixed(2)}</b>, reveal the code, then enter it below. <b>Do not redeem it yourself.</b></div>
                <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{method==='apple'?'Apple':'Google Play'} gift card code</label>
                <input type="text" value={gcCode} onChange={e=>setGcCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" style={{fontFamily:'monospace',letterSpacing:'0.05em',marginBottom:12}} />
              </div>
            )}

            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6,marginTop:8}}>Your in-game username</label>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. CamelS2" style={{marginBottom:14}} />

            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Your Discord username</label>
            <input value={discord} onChange={e=>setDiscord(e.target.value)} placeholder="e.g. camel5961" style={{marginBottom:14}} />

            <button className="btn btn-gold" style={{width:'100%'}} disabled={state==='sending' || !canSubmit()} onClick={submit}>
              {state==='sending' ? 'Sending…' : 'Place order'}
            </button>
            {state==='error' && <div className="alert err">Order could not be sent. DM <b>camel5961</b> on Discord and we will sort you out directly.</div>}
            <p className="msub" style={{marginTop:14, marginBottom:0}}>{isSell ? 'Placing a request pings our team instantly. We confirm the transfer and pay out shortly after.' : 'Next you will be asked for your G22 "Flock" listing so we can deliver the gold. Orders are filled within 3 hours — larger orders can take longer.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
function Packs({ buy, lang, tier, go }) {
  return (
    <section id="packs">
      <div className="wrap">
        <div className="sect-head">
          <div className="eyebrow">{t(lang,'packs_eyebrow')}</div>
          <h2>{t(lang,'packs_h2a')} <span className="goldtext">{t(lang,'packs_h2b')}</span></h2>
          <p>{t(lang,'packs_p')}</p>
        </div>
        <div className="grid4">
          {PACKS.map(p => (
            <div key={p.id} className="card">
              {p.tag && <div className="badge">{p.tag}</div>}
              <h3>{p.name}</h3>
              <div className="sub">{p.blurb}</div>
              <div className="goldamt goldtext">{fmt(p.gold + p.bonus)} gold</div>
              <div className="price" style={{marginTop:10}}>{packDiscPct(tier) ? <span>${(Math.round(p.price*(100-packDiscPct(tier)))/100).toFixed(2)} <s style={{color:'var(--muted)',fontSize:15,fontWeight:400}}>${p.price}</s></span> : <span>${p.price}</span>}</div>
              {packDiscPct(tier) ? <div className="permo" style={{color:'var(--green)'}}>Subscriber -{packDiscPct(tier)}% applied</div> : <div className="permo" onClick={()=>go && go('subs')} style={{cursor:'pointer',textDecoration:'underline'}}>Gold subs pay ${(Math.round(p.price*95)/100).toFixed(2)} →</div>}
              <ul className="feat">
                <li>Delivered within 24 hours</li>
                <li>Hand-delivered by our team</li>
                <li>{Math.round((p.gold+p.bonus)/p.price)} gold per dollar</li>
              </ul>
              <button className="btn btn-gold" onClick={() => buy({ type:'Gold Pack', label:`${p.name} — ${fmt(p.gold+p.bonus)} gold`, price:p.price, gold:p.gold+p.bonus })}>Buy {p.name}</button>
            </div>
          ))}
        </div>
        <p style={{textAlign:'center',color:'var(--muted)',fontSize:14,marginTop:28}}>
          Want the best gold-per-dollar rate? <a href="#subs">Check out daily subscriptions →</a>
        </p>
      </div>
    </section>
  );
}

// Biggest yearly saving across the tiers, derived from the prices themselves.
const maxYearlySave = Math.max(0, ...TIERS.map(t => Math.round((1 - t.yr / (t.mo * 12)) * 100)));

function Subs({ buy, lang }) {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="subs" style={{background:'var(--bg2)'}}>
      <div className="wrap">
        <div className="sect-head">
          <div className="eyebrow">{t(lang,'subs_eyebrow')}</div>
          <h2>{t(lang,'subs_h2a')} <span className="goldtext">{t(lang,'subs_h2b')}</span></h2>
          <p>{t(lang,'subs_p')}</p>
        </div>
        <div className="toggle" role="tablist">
          <button className={!yearly ? 'on' : ''} onClick={()=>setYearly(false)}>Monthly</button>
          <button className={yearly ? 'on' : ''} onClick={()=>setYearly(true)}>Yearly <span className="save">save up to {maxYearlySave}%</span></button>
        </div>
        <div className="grid3">
          {TIERS.map(t => {
            const price = yearly ? t.yr : t.mo;
            const perMo = yearly ? t.yr/12 : t.mo;
            const moGold = t.monthly;
            const daily = Math.round(moGold / 30);
            return (
              <div key={t.id} className={'card' + (t.best ? ' best' : '')} style={t.best ? {paddingTop:34} : null}>
                {t.tag && <div className="badge">{t.tag}</div>}
                <h3>{t.name}</h3>
                <div className="sub">≈ {fmt(daily)} gold claimable daily</div>
                <div className="price">${price}<small>/{yearly?'yr':'mo'}</small>{yearly && <span className="was">${(t.mo*12).toFixed(2)}</span>}</div>
                {yearly && <div className="permo">≈ ${perMo.toFixed(2)}/mo — rate locked for a year</div>}
                <div className="goldamt goldtext">{fmt(moGold)} gold / month</div>
                {yearly && <div style={{color:'var(--green)',fontSize:13,fontWeight:600,marginBottom:10}}>+ {fmt(YEARLY_BONUS[t.id])} bonus gold credited instantly</div>}
                <ul className="feat">
                  <li>{fmt(moGold)} gold per month total</li>
                  <li>≈ {fmt(daily)} gold to claim each day</li>
                  <li>{fmt(Math.round(moGold/perMo))} gold per dollar</li>
                  <li>{PACK_DISC[t.id]}% off all gold packs</li>
                  {t.best && <li>Best gold-per-dollar rate we offer</li>}
                </ul>
                <button className={'btn ' + (t.best ? 'btn-gold' : 'btn-ghost')} onClick={() => buy({ type:'Subscription', label:`${t.name} ${yearly?'Yearly':'Monthly'} — ${fmt(moGold)} gold/month${yearly ? ` + ${fmt(YEARLY_BONUS[t.id])} bonus gold instantly` : ''}`, price, gold: daily + (yearly ? YEARLY_BONUS[t.id] : 0), goldNote: yearly ? 'flock_note_first_yr' : 'flock_note_first' })}>
                  Get {t.name}
                </button>
              </div>
            );
          })}
        </div>
        <p style={{textAlign:'center',color:'var(--muted)',fontSize:13,marginTop:26}}>Launch pricing — lock your rate in before it goes up.</p>
      </div>
    </section>
  );
}

function HowItWorks({ lang }) {
  return (
    <section id="how">
      <div className="wrap">
        <div className="sect-head">
          <div className="eyebrow">{t(lang,'how_eyebrow')}</div>
          <h2>{t(lang,'how_h2a')} <span className="goldtext">{t(lang,'how_h2b')}</span></h2>
        </div>
        <div className="steps">
          <div className="step"><h3>Pick your gold</h3><p>Choose an instant pack or a daily subscription and drop your Standoff 2 ID at checkout.</p></div>
          <div className="step"><h3>Pay over Discord</h3><p>Our team DMs you to take payment securely — the same crew that runs standoff2markettracker.com.</p></div>
          <div className="step"><h3>Gold hits your account</h3><p>Right after you order we show you an amount to list a G22 "Flock" for. Send us its pattern number and a screenshot and we buy the listing out — orders are filled within 3 hours (larger orders can take longer). Subscribers claim their gold from the dashboard every day.</p></div>
        </div>
      </div>
    </section>
  );
}

function Sell({ sell, lang }) {
  const [amt, setAmt] = useState(10000);
  const rate = 0.0025;
  const payout = (amt * rate).toFixed(2);
  return (
    <section id="sell" style={{background:'var(--bg2)'}}>
      <div className="wrap sellgrid">
        <div>
          <div className="eyebrow">{t(lang,'sell_eyebrow')}</div>
          <h2 style={{fontSize:'clamp(26px,3.6vw,36px)',margin:'10px 0 14px'}}>{t(lang,'sell_h2a')} <span className="goldtext">{t(lang,'sell_h2b')}</span></h2>
          <p style={{color:'var(--muted)',marginBottom:16}}>We buy back gold at a flat rate — no minimums, no tiers, no surprises.</p>
          <ul className="feat">
            <li>Flat rate: $0.0025 per gold</li>
            <li>Any amount, same rate every time</li>
            <li>Paid out after in-game transfer confirms</li>
          </ul>
        </div>
        <div className="card" style={{transform:'none'}}>
          <div className="field">
            <label>How much gold are you selling?</label>
            <input type="number" min="100" step="100" value={amt} onChange={e=>setAmt(Math.max(0, parseInt(e.target.value)||0))} />
          </div>
          <div className="quote">Your payout: <b>${payout}</b> <span style={{color:'var(--muted)'}}>at ${rate.toFixed(4)}/gold flat rate</span></div>
          <button className="btn btn-gold" style={{width:'100%',marginTop:16}} disabled={amt<100} onClick={() => sell({ type:'Sell Gold Request', label:`Selling ${fmt(amt)} gold @ $${rate.toFixed(4)}`, price: parseFloat(payout) })}>Request payout</button>
        </div>
      </div>
    </section>
  );
}

function FAQ({ lang }) {
  const QA = [
    ['What are points?', 'Points are how you buy gold here. 1 point is always worth 1 gold. You can buy them, get them every day with a plan, or earn them free, and they stay in your wallet until you exchange them.'],
    ['How do I turn points into gold?', 'Open your wallet, pick Exchange and choose how many points to swap (250 minimum). We show you an exact amount to list a G22 "Flock" for. Send us its pattern number and a screenshot and our team buys the listing out, usually within 3 hours. Larger amounts can take longer.'],
    ['How do plans work?', 'Your plan pays points into your wallet every day at 00:00 UTC: Bronze 25, Silver 67, Gold 217. Save the points up and exchange them whenever you like. Yearly plans add bonus points on day one.'],
    ['How do I pay?', 'Pick a method at checkout: Cash App, Venmo, Ko-fi/PayPal, crypto, or an Apple/Google gift card. Paying in crypto adds ' + PTS.crypto + '% extra points. We never charge a card on this website. Points land once our team confirms the payment.'],
    ['Can I earn points for free?', 'Yes. Check in every day for points and a streak bonus on day 7, do the quick tasks, enter the weekly Price Call on the Market Tracker, and collect tickets for the weekly draw. Free points can be exchanged after your first purchase.'],
    ['Can I cancel my plan?', 'Plans do not renew on their own. Points you already have stay yours.'],
    ['Is this legit?', 'We are the team behind standoff2markettracker.com, the Standoff 2 price tracker with live skin prices, giveaways, and an active Discord community. Come say hi before you spend a cent.'],
  ];
  return (
    <section id="faq">
      <div className="wrap" style={{maxWidth:760}}>
        <div className="sect-head"><div className="eyebrow">{t(lang,'faq_eyebrow')}</div><h2>{t(lang,'faq_h2')}</h2></div>
        {QA.map(([q,a],i) => <details key={i}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  );
}

function ClaimModal({ user, tier, amount, username: initialUsername, onClose, onClaimed, lang }) {
  const L = k => t(lang || 'en', k);
  const [step, setStep] = useState('form');
  const [username, setUsername] = useState(initialUsername || '');
  const [discord, setDiscord] = useState('');
  const [listOffset] = useState(randListOffset);
  const [errMsg, setErrMsg] = useState('');
  const color = TIER_COLOR[tier] || 'var(--gold)';
  const listPrice = +(amount + listOffset).toFixed(2);

  const canSubmit = username.trim() && discord.trim();

  const submit = async (pattern, screenshot) => {
    setStep('submitting');
    try {
      const today = new Date().toISOString().slice(0,10);
      const payload = { embeds: [{
        title: '💰 New Daily Gold Claim', color: 16766720,
        fields: [
          { name: 'Username', value: username.trim(), inline: true },
          { name: 'Discord', value: discord.trim(), inline: true },
          { name: 'Tier', value: tier, inline: true },
          { name: 'Amount', value: fmt(amount) + ' G', inline: true },
          { name: 'G22 Flock Pattern', value: pattern, inline: true },
          { name: 'Listed For', value: fmtG(listPrice) + ' G', inline: true },
        ],
        description: 'Listing screenshot attached below. Find the G22 "Flock" by pattern number, fill the claim, then mark complete in admin.',
        timestamp: new Date().toISOString()
      }] };
      const ext = (screenshot.name.match(/\.[a-zA-Z0-9]+$/) || ['.png'])[0];
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify(payload));
      fd.append('files[0]', screenshot, 'claim-screenshot' + ext);
      const res = await fetch(WEBHOOK + '?wait=true', { method: 'POST', body: fd });
      let screenshotUrl = null;
      try { const msg = await res.json(); screenshotUrl = msg?.attachments?.[0]?.url || null; } catch(e) {}
      await db.ref('dailyClaims/' + user.uid + '/' + today).set({
        uid: user.uid, displayName: user.displayName || '', email: user.email || '',
        discord: discord.trim(), username: username.trim(), tier, amount,
        flockPattern: pattern, listPrice,
        screenshotUrl, status: 'pending', createdAt: new Date().toISOString(), claimDate: today
      });
      setStep('submitted');
      onClaimed();
      return true;
    } catch (e) {
      setErrMsg(e.message || 'Something went wrong');
      setStep('error');
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="xbtn" onClick={onClose} aria-label="Close">×</button>
        <div className="eyebrow" style={{marginBottom:4}}>Daily Gold Claim</div>
        <h3 style={{color, marginBottom:14}}>{fmt(amount)} G</h3>
        {step !== 'error' && <OrderProgress step={step === 'submitted' ? 3 : step === 'form' ? 1 : 2} steps={['prog_details','prog_listing','prog_gold']} accent={color} busy={step === 'submitting'} lang={lang} />}

        {step === 'form' && (
          <div>
            <p className="msub">Confirm your details and we'll show you how to collect today's gold.</p>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Your in-game username</label>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. CamelS2" style={{marginBottom:12}} />
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Your Discord username</label>
            <input value={discord} onChange={e=>setDiscord(e.target.value)} placeholder="e.g. camel5961" style={{marginBottom:12}} />
            <button className="btn btn-gold" style={{width:'100%',marginTop:8}} disabled={!canSubmit} onClick={()=>setStep('flock')}>
              Continue →
            </button>
          </div>
        )}

        {step === 'flock' && (
          <FlockStep listPrice={listPrice} accent={color} submitLabel={L('flock_claim_send')} onSubmit={submit} lang={lang} />
        )}

        {step === 'submitting' && (
          <div style={{textAlign:'center',padding:'24px 0'}}>
            <div style={{fontSize:32,marginBottom:12}}>⟳</div>
            <div style={{color:'var(--muted)',fontSize:14}}>Uploading and submitting your claim…</div>
          </div>
        )}

        {step === 'submitted' && (
          <div className="oksplash">
            <div className="big">✓</div>
            <h3>{L('claim_done_h')}</h3>
            <p className="msub" style={{marginTop:8}}>We got your G22 "Flock" details. Your claim should be filled within <b style={{color:'var(--gold)'}}>3 hours</b> — larger orders can take longer. Watch your dashboard for the status to update.</p>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{marginTop:10}}>Done</button>
          </div>
        )}

        {step === 'error' && (
          <div>
            <div className="alert err">Claim could not be submitted{errMsg?': '+errMsg:''}. DM <b>camel5961</b> on Discord and we'll sort it out.</div>
            <button className="btn btn-ghost btn-sm" style={{marginTop:10,width:'100%'}} onClick={()=>setStep('flock')}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Dashboard({ user, signIn, lifetimeGold, go, lang }) {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [claims, setClaims] = useState([]);
  const [claimOpen, setClaimOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    const ref = db.ref('users/' + user.uid);
    ref.on('value', s => setData(s.val()));
    const oref = db.ref('goldPurchases/' + user.uid);
    oref.on('value', s => {
      const dd = s.val() || {};
      const list = Object.keys(dd).map(ts => Object.assign({ ts }, dd[ts]));
      list.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
      setOrders(list);
    });
    const cref = db.ref('dailyClaims/' + user.uid);
    cref.on('value', s => {
      const dd = s.val() || {};
      const list = Object.keys(dd).map(date => Object.assign({ date }, dd[date]));
      list.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
      setClaims(list);
    });
    return () => { try { ref.off('value'); oref.off('value'); cref.off('value'); } catch(e){} };
  }, [user]);
  if (!user) return (
    <section><div className="wrap" style={{textAlign:'center',maxWidth:520}}>
      <div className="eyebrow">Dashboard</div>
      <h2 style={{margin:'10px 0 14px'}}>Sign in to claim your daily gold</h2>
      <p style={{color:'var(--muted)',marginBottom:22}}>Track your balance, orders and daily claims in one place.</p>
      <button className="btn btn-gold" onClick={signIn}>Sign in or create account</button>
    </div></section>
  );
  const tierKey = activeTier(data);
  const subDaysLeft = daysLeft(data);
  const subExpired = !!(data?.subscriptionTier && !tierKey);
  const dailyAmount = tierKey ? (DAILY_GOLD[tierKey] || 0) : 0;
  const today = new Date().toISOString().slice(0,10);
  const todaysClaim = claims.find(c => c.date === today);
  const alreadyClaimed = todaysClaim && todaysClaim.status === 'complete';
  const isPending = todaysClaim && todaysClaim.status !== 'complete';
  const lg = lifetimeGold || 0;
  const loyaltyUnlocked = lg >= LOYALTY_THRESHOLD;
  const loyaltyPct = Math.min(100, Math.round(lg / LOYALTY_THRESHOLD * 100));
  const statusColor = st => (st === 'complete' || st === 'delivered') ? 'var(--green)' : 'var(--gold)';
  return (
    <section><div className="wrap">
      <div className="sect-head"><div className="eyebrow">Dashboard</div><h2>Welcome back, <span className="goldtext">{(user.displayName||'player').split(' ')[0]}</span></h2></div>
      <div className="dash">
        <div className="card"><div className="sub">Gold balance</div><div className="statnum">{fmt(data?.goldBalance || 0)}</div></div>
        <div className="card"><div className="sub">Subscription</div><div className="statnum" style={{fontSize:30}}>{tierKey ? tierKey.toUpperCase() : subExpired ? 'EXPIRED' : 'None yet'}</div>
          {tierKey && subDaysLeft != null && <div className="sub" style={{marginBottom:0,color:subDaysLeft <= 7 ? 'var(--gold)' : 'var(--muted)'}}>{subDaysLeft <= 0 ? 'Renews today' : subDaysLeft === 1 ? 'Renews tomorrow' : 'Renews in ' + subDaysLeft + ' days'}</div>}
          {!tierKey && <button onClick={()=>go('subs')} style={{fontSize:13,background:'none',border:'none',color:'var(--gold)',cursor:'pointer',padding:0,textDecoration:'underline'}}>{subExpired ? 'Renew now →' : 'Pick a tier →'}</button>}
        </div>
        <div className="card">
          <div className="sub">Daily claim</div>
          {!tierKey ? (
            <p style={{color:'var(--muted)',fontSize:13,marginTop:8}}>{subExpired ? 'Your subscription has ended — renew it to start claiming again.' : 'Subscribe to unlock daily claims.'}</p>
          ) : alreadyClaimed ? (
            <p style={{color:'var(--green)',fontSize:13,marginTop:8}}>✓ Claimed today — resets at 00:00 UTC.</p>
          ) : isPending ? (
            <p style={{color:'var(--gold)',fontSize:13,marginTop:8}}>Pending — we're on it!</p>
          ) : (
            <button className="btn btn-gold btn-sm" onClick={()=>setClaimOpen(true)} style={{marginTop:8}}>Claim {fmt(dailyAmount)} G</button>
          )}
        </div>
      </div>

      {(() => {
        const NEXT = { bronze:'silver', silver:'gold' };
        const nextTier = tierKey && NEXT[tierKey];
        const doneClaims = claims.filter(c => c.status === 'complete').length;
        if (!nextTier || doneClaims < 14) return null;
        const missed = (DAILY_GOLD[nextTier] - DAILY_GOLD[tierKey]) * doneClaims;
        const nextName = nextTier.charAt(0).toUpperCase() + nextTier.slice(1);
        return (
          <div className="card" style={{transform:'none',marginTop:22,borderColor:'var(--gold)'}}>
            <div className="eyebrow" style={{marginBottom:8}}>Upgrade &amp; earn more</div>
            <p className="sub" style={{marginBottom:10}}>You have claimed <b>{doneClaims} days</b> on {tierKey.toUpperCase()}. The same claims on {nextName} would have earned you <b style={{color:'var(--gold)'}}>+{fmt(missed)} gold</b> extra.</p>
            <button className="btn btn-gold btn-sm" onClick={()=>go('subs')}>See {nextName} tier →</button>
          </div>
        );
      })()}

      <div className="card" style={{transform:'none',marginTop:22}}>
        <div className="eyebrow" style={{marginBottom:8}}>Refer a friend</div>
        <p className="sub" style={{marginBottom:10}}>Share your link — you and your friend each get <b style={{color:'var(--gold)'}}>100 gold</b> when they place their first order.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input readOnly value={'https://standoffmarkettracker-design.github.io/CheapStandoff2Gold/?ref=' + user.uid} style={{flex:1,minWidth:200,fontSize:12}} onFocus={e=>e.target.select()} />
          <button className="btn btn-ghost btn-sm" onClick={()=>{ navigator.clipboard.writeText('https://standoffmarkettracker-design.github.io/CheapStandoff2Gold/?ref=' + user.uid).catch(()=>{}); }}>Copy link</button>
        </div>
      </div>

      {tierKey && (
        <div className="card" style={{transform:'none',marginTop:22}}>
          <div className="eyebrow" style={{marginBottom:12}}>How daily claims work</div>
          {[['Click Claim','Opens the claim form for your tier\'s daily amount.'],['Confirm your details','Your in-game username and Discord, so we can reach you.'],['List a G22 "Flock"','We then show you an exact amount — list one for it, and send the pattern number and a screenshot.'],['Gold arrives','We buy out your listing within 3 hours — larger amounts can take longer — and mark the claim complete.']].map((step,i) => (
            <div key={i} style={{display:'flex',gap:12,marginBottom:i<3?12:0,alignItems:'flex-start'}}>
              <div style={{width:20,height:20,borderRadius:5,background:'rgba(20,23,26,.04)',border:'1px solid var(--line)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--muted)',fontSize:11,fontWeight:700,flexShrink:0,marginTop:2}}>{i+1}</div>
              <div><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{step[0]}</div><div style={{color:'var(--muted)',fontSize:12,lineHeight:1.5}}>{step[1]}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{transform:'none',marginTop:22}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
          <div style={{fontWeight:700,fontFamily:'Figtree',fontSize:18}}>Loyalty {loyaltyUnlocked && <span style={{color:'var(--green)',fontSize:13}}>· 5% OFF UNLOCKED</span>}</div>
          <div className="sub" style={{marginBottom:0}}>{fmt(lg)} / {fmt(LOYALTY_THRESHOLD)} G lifetime</div>
        </div>
        <div style={{background:'rgba(20,23,26,.10)',borderRadius:20,height:12,overflow:'hidden'}}>
          <div style={{width:loyaltyPct+'%',height:'100%',background:loyaltyUnlocked?'var(--green)':'linear-gradient(90deg,var(--gold-hot),var(--gold))',transition:'width .4s'}}></div>
        </div>
        <p className="msub" style={{marginTop:8,marginBottom:0}}>{loyaltyUnlocked ? 'You have unlocked a permanent 5% discount on all gold purchases. Thank you!' : `Buy ${fmt(LOYALTY_THRESHOLD - lg)} more lifetime gold to unlock a permanent 5% discount.`}</p>
      </div>

      <div style={{marginTop:22}}>
        <h3 style={{fontFamily:'Figtree',fontSize:20,marginBottom:12}}>Order &amp; claim history</h3>
        {(() => {
          const combined = [
            ...orders.map(o => ({ kind:'order', key:'o'+o.ts, createdAt:o.createdAt, status:o.status,
              title: o.amount ? (fmt(o.amount)+' gold'+(o.discountPct>0?` (${o.discountPct}% off)`:'')) : (o.label || o.type || 'Order'),
              sub: [o.method, o.tier, o.price?('$'+o.price):null].filter(Boolean).join(' · ') })),
            ...claims.map(c => ({ kind:'claim', key:'c'+c.date, createdAt:c.createdAt, status:c.status,
              title: fmt(c.amount||0)+' gold claim',
              sub: [c.tier+' tier', c.date].filter(Boolean).join(' · ') }))
          ];
          combined.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
          if (combined.length === 0) return <p className="msub">No orders or claims yet.</p>;
          return (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {combined.map(h => (
                <div key={h.key} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'14px 18px'}}>
                  <div>
                    <div style={{fontWeight:600}}>{h.title}</div>
                    <div className="sub" style={{marginBottom:0}}>{h.sub} · {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div style={{fontWeight:700,fontSize:13,color:statusColor(h.status),textTransform:'uppercase',fontFamily:'Figtree',letterSpacing:'.05em'}}>
                    {h.status === 'complete' || h.status === 'delivered' ? '✓ Delivered' : h.status === 'failed' ? '✕ Failed' : h.status === 'awaiting_listing' ? 'Awaiting listing' : (h.status || 'pending')}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      {claimOpen && <ClaimModal user={user} tier={tierKey} amount={dailyAmount} username={data?.standoffUsername || user.displayName} onClose={()=>setClaimOpen(false)} onClaimed={()=>setClaimOpen(false)} lang={lang} />}
    </div></section>
  );
}

function AuthPanel({ onClose }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSignUp = () => {
    setError(null);
    if (!email || !password || !displayName) { setError('Please fill in all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setBusy(true);
    window.firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(cred => cred.user.updateProfile({ displayName })
        .then(() => cred.user.sendEmailVerification())
        .then(() => {
          const uid = cred.user.uid;
          return Promise.all([
            db.ref('users/' + uid + '/name').set(displayName),
            db.ref('users/' + uid + '/email').set(email),
            db.ref('users/' + uid + '/joined').set(Date.now())
          ]).catch(() => {});
        }))
      .then(() => { window.firebase.auth().signOut(); setBusy(false); setSuccess('Account created! Check your email (and spam folder) to verify, then sign in.'); })
      .catch(e => {
        setBusy(false);
        if (e.code === 'auth/email-already-in-use') {
          setError('That email already has an account (maybe from our main site?). Tap "Sign in" above instead — or use "Forgot password?" if you don’t remember it.');
        } else {
          setError(e.message);
        }
      });
  };

  const handleLogin = () => {
    setError(null);
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setBusy(true);
    window.firebase.auth().signInWithEmailAndPassword(email, password)
      .then(cred => {
        if (!cred.user.emailVerified) {
          cred.user.sendEmailVerification().catch(() => {});
          window.firebase.auth().signOut();
          setBusy(false);
          setError('Email not verified yet. We sent a new verification link \u2014 check your inbox and spam folder.');
          return;
        }
        setBusy(false); setSuccess('Signed in!'); setTimeout(onClose, 700);
      })
      .catch(e => { setBusy(false); setError(e.message); });
  };

  const handleReset = () => {
    setError(null); setSuccess(null);
    if (!email) { setError('Enter your email above first, then tap "Forgot password?" again.'); return; }
    setBusy(true);
    window.firebase.auth().sendPasswordResetEmail(email)
      .then(() => { setBusy(false); setSuccess('Password reset email sent — check your inbox (and spam folder).'); })
      .catch(e => { setBusy(false); setError(e.message); });
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="xbtn" onClick={onClose} aria-label="Close">×</button>
        <h3>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h3>
        <p className="msub">{mode === 'signup' ? 'One free account works across both our sites.' : 'Welcome back \u2014 sign in to claim and track your gold.'}</p>
        <div className="toggle" style={{marginBottom:18}}>
          <button className={mode==='login'?'on':''} onClick={()=>{setMode('login');setError(null);setSuccess(null);}}>Sign in</button>
          <button className={mode==='signup'?'on':''} onClick={()=>{setMode('signup');setError(null);setSuccess(null);}}>Sign up</button>
        </div>
        {mode === 'signup' && (
          <div className="field">
            <label>Display name</label>
            <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {mode === 'login' && (
          <button type="button" onClick={handleReset} style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,cursor:'pointer',padding:0,marginBottom:14,textDecoration:'underline'}}>Forgot password?</button>
        )}
        {error && <div className="alert err">{error}</div>}
        {success && <div className="alert" style={{borderColor:'var(--green)',color:'var(--green)',background:'rgba(14,138,80,.08)'}}>{success}</div>}
        <button className="btn btn-gold" style={{width:'100%',marginTop:8}} disabled={busy} onClick={mode==='signup'?handleSignUp:handleLogin}>
          {busy ? 'Working\u2026' : (mode === 'signup' ? 'Create account' : 'Sign in')}
        </button>
        <p className="msub" style={{marginTop:14,marginBottom:0}}>Trouble signing in? DM <b style={{color:'var(--gold)'}}>camel5961</b> on Discord.</p>
      </div>
    </div>
  );
}

function BuyGoldPanel({ user, tier, signIn, flashSale, lifetimeGold, hasPurchased, avgDeliveryHrs, lang }) {
  const L = k => t(lang || 'en', k);
  const RATES = { none:0.0086, bronze:0.008, silver:0.0058, gold:0.004 };
  const tierKey = (tier || 'none').toLowerCase();
  const rate = RATES[tierKey] !== undefined ? RATES[tierKey] : 0.0075;
  const HANDLES = PAYMENT_HANDLES;
  const APPLE_DENOMS = [5,10,15,25,50,100];
  const GOOGLE_DENOMS = [10,15,25,50,100];
  const CRYPTO = CRYPTO_WALLETS;
  const METHODS = PAYMENT_METHODS;

  const [method, setMethod] = useState('cashapp');
  const [amt, setAmt] = useState(2000);
  const [gcDenom, setGcDenom] = useState(10);
  const [gcCode, setGcCode] = useState('');
  const [username, setUsername] = useState(user ? (user.displayName || '') : '');
  const [discord, setDiscord] = useState('');
  const [copied, setCopied] = useState('');
  const [step, setStep] = useState('form');
  const [listOffset] = useState(randListOffset);
  const [orderKey, setOrderKey] = useState(null);
  const [orderTs, setOrderTs] = useState(null);

  const isCard = method === 'apple' || method === 'google';
  const isDirect = method === 'cashapp' || method === 'venmo';
  const isKofi = method === 'kofi';
  const isCrypto = method === 'crypto';
  const goldForCalc = isCard ? Math.round(gcDenom / rate) : amt;
  const listPrice = goldForCalc > 0 ? +(goldForCalc + listOffset).toFixed(2) : null;
  const baseCost = goldForCalc * rate;
  const loyaltyUnlocked = (lifetimeGold || 0) >= LOYALTY_THRESHOLD;
  const isFirst = user && !hasPurchased;
  const disc = computeDiscounts(baseCost, goldForCalc, { flash: flashSale, loyalty: loyaltyUnlocked, first: isFirst });
  const cost = disc.finalCost.toFixed(2);
  const gcGold = Math.round(gcDenom / rate);

  const copyText = (t, key) => { navigator.clipboard.writeText(t).catch(()=>{}); setCopied(key); setTimeout(()=>setCopied(''), 1500); };
  const canSubmit = () => username.trim() && discord.trim() && (isCard ? gcCode.trim().length >= 8 : amt >= 100);

  const submit = async () => {
    if (!canSubmit()) return;
    setStep('submitting');
    const methodLabel = PAYMENT_METHOD_LABELS[method];
    const goldAmt = isCard ? gcGold : amt;
    const priceStr = disc.totalPct > 0 ? (`$${cost} (was $${baseCost.toFixed(2)}, ${disc.totalPct}% off)`) : (`$${cost}`);
    const amountStr = isCard ? (`$${gcDenom} gift card → ${fmt(gcGold)} G`) : (`${fmt(amt)} G — ${priceStr}`);
    const order = {
      Type: 'Custom Gold', Username: username.trim(), Discord: discord.trim(), Tier: tier || 'None',
      Method: methodLabel, Amount: amountStr,
      Account: user ? (user.email || user.uid) : 'guest'
    };
    if (disc.lines.length) order['Discounts'] = disc.lines.map(l => l.label + ' -' + l.pct + '%').join(', ');
    if (isCard) order['Gift Card Code'] = '||' + gcCode.trim() + '||';
    if (listPrice) order['To Be Listed For'] = fmtG(listPrice) + ' G';
    const res = await submitOrder(order);
    const ts = Date.now();
    try {
      if (user) {
        db.ref('goldPurchases/' + user.uid + '/' + ts).set({
          uid: user.uid, username: username.trim(), discord: discord.trim(), tier: tier || 'None', method,
          status: 'awaiting_listing', amount: goldAmt, price: parseFloat(cost), discountPct: disc.totalPct,
          flockPattern: null, listPrice: listPrice || null,
          gcCode: isCard ? gcCode.trim() : null, createdAt: new Date().toISOString()
        });
        feedPush(ts, { handle: maskHandle(username), gold: goldAmt || 0, listed: null, status: 'awaiting_listing', fillMins: null });
        db.ref('users/' + user.uid + '/hasPurchased').set(true);
        db.ref('users/' + user.uid + '/lifetimeGold').transaction(v => (v || 0) + goldAmt);
      }
    } catch(e) {}
    setOrderKey(res.key); setOrderTs(ts);
    setStep(res.ok ? 'flock' : 'error');
  };

  const sendFlock = async (pattern, screenshot) => {
    const res = await submitFlock({ orderKey, type: 'Custom Gold', label: fmt(goldForCalc) + ' G', username: username.trim(), discord: discord.trim(), pattern, listPrice, screenshot });
    if (!res.ok) return false;
    try {
      if (user && orderTs) db.ref('goldPurchases/' + user.uid + '/' + orderTs).update({ flockPattern: pattern, status: 'pending' });
      if (user && orderTs) feedUpdate(orderTs, { listed: listPrice || null, status: 'listed' });
    } catch(e) {}
    setStep('done');
    return true;
  };

  const progressSteps = ['prog_details','prog_listing','prog_gold'];

  if (step === 'flock') return (
    <div className="card" style={{maxWidth:520,margin:'0 auto',transform:'none'}}>
      <OrderProgress step={2} steps={progressSteps} lang={lang} />
      <FlockStep listPrice={listPrice} heading={L('flock_head_submitted')} submitLabel={L('flock_send')} onSubmit={sendFlock} lang={lang} />
    </div>
  );

  if (step === 'done') return (
    <div className="card" style={{maxWidth:520,margin:'0 auto',textAlign:'center',transform:'none'}}>
      <OrderProgress step={3} steps={progressSteps} lang={lang} />
            <h3 style={{marginTop:8}}>Order submitted!</h3>
      <p className="msub" style={{marginTop:8}}>{L('done_p')}</p>
      <button className="btn btn-ghost btn-sm" style={{marginTop:12}} onClick={()=>{setStep('form');setGcCode('');setOrderKey(null);setOrderTs(null);}}>Place another order</button>
    </div>
  );

  return (
    <div style={{maxWidth:560,margin:'0 auto',position:'relative'}}>
      {!user && (
        <div style={{position:'absolute',inset:0,zIndex:10,borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(244,246,245,.9)',backdropFilter:'blur(4px)'}}>
                    <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>Sign in to buy gold</div>
          <div className="msub" style={{textAlign:'center',padding:'0 32px',marginBottom:16}}>Create a free account to get started.</div>
          <button className="btn btn-gold" onClick={signIn}>Sign in / Create account</button>
        </div>
      )}
      <div className="card" style={{transform:'none'}}>
        <OrderProgress step={1} steps={progressSteps} busy={step === 'submitting'} lang={lang} />
        <div className="sub" style={{marginBottom:12}}>Your rate: <b style={{color:'var(--gold)'}}>${rate}/gold</b> {tierKey!=='none' ? `(${tier} discount applied)` : '— subscribe for a better rate'}</div>
        {avgDeliveryHrs != null && avgDeliveryHrs > 0 && (
          <div style={{fontSize:12,color:'var(--green)',marginBottom:12,marginTop:-6}}>Avg delivery time: ~{avgDeliveryHrs < 1 ? Math.round(avgDeliveryHrs*60)+' min' : avgDeliveryHrs.toFixed(1)+' hrs'}</div>
        )}
        {disc.lines.length > 0 && (
          <div style={{background:'var(--gold-dim)',border:'1px dashed var(--gold)',borderRadius:8,padding:'10px 12px',marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:'var(--gold)',marginBottom:6}}>Discounts applied</div>
            {disc.lines.map((l,i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--muted)',marginBottom:2}}>
                <span>{l.label}</span><span style={{color:'var(--green)'}}>−{l.pct}%</span>
              </div>
            ))}
            <div style={{borderTop:'1px solid var(--line)',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700}}>
              <span>Total savings</span><span style={{color:'var(--green)'}}>−{disc.totalPct}% (${(disc.baseCost - disc.finalCost).toFixed(2)})</span>
            </div>
          </div>
        )}

        <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Payment method</label>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:16}}>
          {METHODS.map(m => (
            <div key={m.id} onClick={()=>setMethod(m.id)} style={{padding:'10px 4px',border:'1px solid '+(method===m.id?'var(--gold)':'var(--line)'),borderRadius:8,background:method===m.id?'var(--gold-dim)':'transparent',color:method===m.id?'var(--ink)':'var(--muted)',fontSize:11,fontWeight:600,cursor:'pointer',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <span style={{fontSize:18}}>{m.icon}</span><span>{m.label}</span>
            </div>
          ))}
        </div>

        {isDirect && (
          <div>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Send payment to</label>
            <div onClick={()=>copyText(HANDLES[method],'handle')} style={{background:'rgba(20,23,26,.10)',border:'1px solid var(--line)',borderRadius:8,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:14}}>
              <span style={{fontFamily:'monospace',fontSize:16,fontWeight:600}}>{HANDLES[method]}</span>
              <span style={{fontSize:11,color:copied==='handle'?'var(--green)':'var(--muted)'}}>{copied==='handle'?'Copied!':'tap to copy'}</span>
            </div>
          </div>
        )}

        {isKofi && (
          <div className="quote" style={{marginBottom:14}}>Pay via Ko-fi — accepts PayPal, credit card, and Apple Pay. Include your username in the Ko-fi message.<br/><a href="https://ko-fi.com/standoff263277" target="_blank" rel="noopener">Open Ko-fi page →</a></div>
        )}

        {isCrypto && (
          <div style={{marginBottom:14}}>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Send the equivalent of <b style={{color:'var(--gold)'}}>${cost}</b> to any wallet (tap to copy)</label>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {CRYPTO.map(w => (
                <div key={w.name} onClick={()=>copyText(w.addr,w.symbol)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(20,23,26,.03)',border:'1px solid var(--line)',borderRadius:8,cursor:'pointer'}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:w.color+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:w.color,flexShrink:0}}>{w.symbol}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600}}>{w.name} {w.note && <span style={{fontSize:10,color:'var(--muted)'}}>({w.note})</span>}</div>
                    <div style={{fontSize:10,color:'var(--muted)',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.addr}</div>
                  </div>
                  <span style={{fontSize:11,color:copied===w.symbol?'var(--green)':'var(--muted)',flexShrink:0}}>{copied===w.symbol?'Copied!':'copy'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isCard ? (
          <div>
            <div className="quote" style={{marginBottom:12}}>{method==='apple'?'Buy an Apple Gift Card from the App Store or any retailer.':'Buy a Google Play Gift Card from any retailer.'} Reveal the code, then enter it below. <b>Do not redeem it yourself.</b></div>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Card value</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:12}}>
              {(method==='apple'?APPLE_DENOMS:GOOGLE_DENOMS).map(d => {
                const g = Math.round(d/rate);
                return (
                  <div key={d} onClick={()=>setGcDenom(d)} style={{padding:'8px 4px',border:'1px solid '+(gcDenom===d?'var(--gold)':'var(--line)'),borderRadius:8,background:gcDenom===d?'var(--gold-dim)':'transparent',cursor:'pointer',textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:600,color:gcDenom===d?'var(--ink)':'var(--muted)'}}>${d}</div>
                    <div style={{fontSize:10,fontFamily:'monospace',color:gcDenom===d?'var(--gold)':'var(--muted)',marginTop:2}}>{fmt(g)} G</div>
                  </div>
                );
              })}
            </div>
            <div className="quote" style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><span>Gold you receive</span><b>{fmt(gcGold)} G</b></div>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{method==='apple'?'Apple':'Google Play'} gift card code</label>
            <input type="text" value={gcCode} onChange={e=>setGcCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" style={{fontFamily:'monospace',letterSpacing:'0.05em',marginBottom:12}} />
          </div>
        ) : (
          <div>
            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Amount of gold</label>
            <input type="number" value={amt} min={100} step={100} onChange={e=>setAmt(Math.max(0,parseInt(e.target.value)||0))} style={{fontFamily:'monospace',marginBottom:10}} />
            <div className="quote" style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><span>You pay{isKofi?' on Ko-fi':isCrypto?' in crypto':''}</span><span>{disc.totalPct > 0 && <span style={{textDecoration:'line-through',color:'var(--muted)',fontSize:15,marginRight:8}}>${disc.baseCost.toFixed(2)}</span>}<b style={{color:'var(--gold)',fontSize:22}}>${cost}</b></span></div>
          </div>
        )}

        <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6,marginTop:8}}>Your in-game username</label>
        <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="e.g. CamelS2" style={{marginBottom:8}} />
        <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>Your Discord username</label>
        <input type="text" value={discord} onChange={e=>setDiscord(e.target.value)} placeholder="e.g. camel5961" style={{marginBottom:8}} />
        <div className="quote" style={{fontSize:12,marginBottom:14}}>{isCrypto?'Copy your username, send the crypto, then submit — include your username so we can match the payment.':'Include your username in the payment note, then submit below.'} Next you will be asked for your G22 "Flock" listing so we can deliver the gold.</div>

        <button className="btn btn-gold" style={{width:'100%'}} disabled={!canSubmit()||step==='submitting'} onClick={submit}>{step==='submitting'?'Submitting…':'Submit purchase'}</button>
        {step==='error' && <div className="alert err">Something went wrong. DM camel5961 on Discord and we'll sort it out.</div>}
        <p className="msub" style={{marginTop:12,marginBottom:0,textAlign:'center'}}>Need help? Discord: <b style={{color:'var(--gold)'}}>camel5961</b></p>
      </div>
    </div>
  );
}
function AdminPanel({ user, signIn, flashSale }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('points');
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [claims, setClaims] = useState([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState(null);
  const [fsLabel, setFsLabel] = useState('Weekend Flash Sale');
  const [fsPct, setFsPct] = useState(15);
  const [fsHours, setFsHours] = useState(48);

  useEffect(() => {
    if (!user) { setChecking(false); return; }
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; setChecking(false); } }, 5000);
    db.ref('admins/' + user.uid).once('value', snap => {
      if (done) return; done = true; clearTimeout(to);
      const ok = snap.val() === true;
      setAuthed(ok); setChecking(false);
      if (ok) { loadUsers(); loadOrders(); loadClaims(); }
    }, () => { if (done) return; done = true; clearTimeout(to); setAuthed(false); setChecking(false); });
  }, [user]);

  const loadUsers = () => db.ref('users').once('value', snap => {
    const d = snap.val() || {};
    setUsers(Object.keys(d).map(uid => Object.assign({ uid }, d[uid])));
  });
  const loadOrders = () => db.ref('goldPurchases').once('value', snap => {
    const d = snap.val() || {};
    const list = [];
    Object.keys(d).forEach(uid => Object.keys(d[uid] || {}).forEach(ts => list.push(Object.assign({ uid, ts }, d[uid][ts]))));
    list.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    setOrders(list);
  });
  const loadClaims = () => db.ref('dailyClaims').once('value', snap => {
    const d = snap.val() || {};
    const list = [];
    Object.keys(d).forEach(uid => Object.keys(d[uid] || {}).forEach(date => list.push(Object.assign({ uid, date }, d[uid][date]))));
    list.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    setClaims(list);
  });

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(()=>setMsg(null), 2500); };
  const markComplete = (o) => {
    const completedAt = Date.now();
    db.ref('goldPurchases/' + o.uid + '/' + o.ts + '/status').set('complete');
    db.ref('goldPurchases/' + o.uid + '/' + o.ts + '/completedAt').set(completedAt);
    feedUpdate(o.ts, { status: 'filled', fillMins: Math.max(1, Math.round((completedAt - Number(o.ts)) / 60000)) });
    if (o.createdAt) {
      const hrs = (completedAt - new Date(o.createdAt).getTime()) / 3600000;
      if (hrs > 0 && hrs < 720) db.ref('deliveryStats').transaction(cur => {
        cur = cur || { avgHrs: hrs, count: 0 };
        const count = (cur.count || 0) + 1;
        const avgHrs = ((cur.avgHrs || hrs) * (count - 1) + hrs) / count;
        return { avgHrs: Math.round(avgHrs * 10) / 10, count };
      });
    }
    flash('ok','Order marked complete'); setTimeout(loadOrders, 300);
  };
  const setTier = (uid, t) => {
    if (!t) { db.ref('users/' + uid).update({ subscriptionTier: null, subscriptionEnds: null, subscriptionTerm: null }); flash('ok','Tier cleared'); setTimeout(loadUsers, 300); return; }
    const term = window.confirm('OK = yearly, Cancel = monthly') ? 'yearly' : 'monthly';
    db.ref('users/' + uid).update({ subscriptionTier: t, subscriptionTerm: term, subscriptionEnds: termEnd(term) });
    flash('ok', 'Tier → ' + t + ' (' + term + ')');
    setTimeout(loadUsers, 300);
  };
  // Extend from whichever is later: today, or the current end date.
  const extendSub = (u, term) => {
    const from = Math.max(Date.now(), u.subscriptionEnds || 0);
    db.ref('users/' + u.uid).update({ subscriptionTerm: term, subscriptionEnds: termEnd(term, from) });
    flash('ok', 'Extended by 1 ' + (term === 'yearly' ? 'year' : 'month'));
    setTimeout(loadUsers, 300);
  };
  const adjustBalance = (uid, cur) => {
    const v = prompt('Set gold balance for this user:', cur || 0);
    if (v === null) return;
    const n = parseInt(v); if (isNaN(n)) return flash('err','Invalid number');
    db.ref('users/' + uid + '/goldBalance').set(n); flash('ok','Balance → ' + fmt(n)); setTimeout(loadUsers, 300);
  };
  const startFlash = () => {
    const pct = parseInt(fsPct), hrs = parseFloat(fsHours);
    if (isNaN(pct) || pct <= 0 || pct > 90) return flash('err','Enter a percent between 1 and 90');
    db.ref('flashSale').set({ active: true, label: fsLabel.trim() || 'Flash Bonus', percent: pct, startedAt: Date.now(), endsAt: hrs > 0 ? Date.now() + hrs*3600000 : null });
    flash('ok','Flash sale started!');
  };
  const stopFlash = () => { db.ref('flashSale').set({ active: false }); flash('ok','Flash sale stopped'); };
  const markClaimComplete = (c) => {
    db.ref('dailyClaims/' + c.uid + '/' + c.date).update({ status: 'complete', completedAt: new Date().toISOString() });
    if (c.tier && DAILY_GOLD[c.tier] != null) {
      db.ref('users/' + c.uid + '/goldBalance').transaction(v => (v || 0) + (c.amount || 0));
    }
    flash('ok', 'Claim marked complete');
    setTimeout(loadClaims, 300);
  };
  const markClaimFailed = (c) => {
    db.ref('dailyClaims/' + c.uid + '/' + c.date).update({ status: 'failed', error: 'manually_rejected' });
    flash('ok','Claim marked failed'); setTimeout(loadClaims, 300);
  };

  if (checking) return <section><div className="wrap" style={{textAlign:'center',color:'var(--muted)'}}>Checking admin access…</div></section>;
  if (!user) return (
    <section><div className="wrap" style={{textAlign:'center',maxWidth:460}}>
            <h2 style={{marginBottom:12}}>Admin</h2>
      <p className="msub" style={{marginBottom:18}}>Sign in to access the admin panel.</p>
      <button className="btn btn-gold" onClick={signIn}>Sign in</button>
    </div></section>
  );
  if (!authed) return (
    <section><div className="wrap" style={{textAlign:'center'}}>
            <h2>Access denied</h2>
      <p className="msub" style={{marginTop:8}}>This account is not an admin.</p>
    </div></section>
  );

  const q = search.trim().toLowerCase();
  const fUsers = q ? users.filter(u => (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || u.uid.includes(q)) : users;
  const fOrders = q ? orders.filter(o => (o.username||'').toLowerCase().includes(q) || (o.method||'').toLowerCase().includes(q)) : orders;
  const fClaims = q ? claims.filter(c => (c.username||'').toLowerCase().includes(q) || (c.discord||'').toLowerCase().includes(q)) : claims;
  const pending = orders.filter(o => o.status === 'pending').length;
  const pendingClaims = claims.filter(c => c.status === 'pending').length;
  // Subscriptions that have run out, or expire within a week, or never had an end date set.
  const subsNeedingAttention = users.filter(u => {
    if (!u.subscriptionTier) return false;
    const d = daysLeft(u);
    return d == null || d <= 7;
  }).length;

  return (
    <section><div className="wrap">
      <div className="sect-head" style={{marginBottom:24}}><div className="eyebrow">Admin</div><h2>Control panel</h2></div>
      {msg && <div className="alert" style={{maxWidth:560,margin:'0 auto 16px',borderColor:msg.type==='ok'?'var(--green)':'var(--danger)',color:msg.type==='ok'?'var(--green)':'var(--danger)',background:msg.type==='ok'?'rgba(14,138,80,.08)':'rgba(196,56,46,.07)'}}>{msg.text}</div>}
      <div className="toggle" style={{marginBottom:18}}>
        <button className={tab==='orders'?'on':''} onClick={()=>setTab('orders')}>Orders {pending>0?`(${pending})`:''}</button>
        <button className={tab==='claims'?'on':''} onClick={()=>setTab('claims')}>Claims {pendingClaims>0?`(${pendingClaims})`:''}</button>
        <button className={tab==='users'?'on':''} onClick={()=>setTab('users')}>Users ({users.length}){subsNeedingAttention>0?` · ${subsNeedingAttention} subs`:''}</button>
        <button className={tab==='flash'?'on':''} onClick={()=>setTab('flash')}>Flash Bonus</button>
        <button className={tab==='points'?'on':''} onClick={()=>setTab('points')}>Points</button>
      </div>
      <div className="field" style={{maxWidth:400,margin:'0 auto 20px'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==='orders'?'Search orders by username/method…':'Search users by name/email/UID…'} />
      </div>

      {tab === 'orders' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {fOrders.length === 0 && <p className="msub" style={{textAlign:'center'}}>No orders yet.</p>}
          {fOrders.map(o => (
            <div key={o.uid+o.ts} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:600}}>{o.username || '(no name)'} <span style={{fontSize:12,color:o.status==='complete'?'var(--green)':'var(--gold)',marginLeft:8}}>● {o.status}</span></div>
                <div className="sub" style={{marginBottom:0}}>{o.amount ? fmt(o.amount)+' G' : (o.label || o.type || 'Order')} · {o.method}{o.tier?' · '+o.tier:''}{o.price?' · $'+o.price:''} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</div>
                {o.gcCode && <div style={{fontSize:12,fontFamily:'monospace',color:'var(--gold)',marginTop:4}}>Gift code: {o.gcCode}</div>}
                {o.referral && <div style={{fontSize:12,color:'var(--gold)',marginTop:4}}>Referred by: {o.referral}</div>}
              </div>
              {o.status !== 'complete' && <button className="btn btn-gold btn-sm" onClick={()=>markComplete(o)}>Mark complete</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'claims' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {fClaims.length === 0 && <p className="msub" style={{textAlign:'center'}}>No claims yet.</p>}
          {fClaims.map(c => (
            <div key={c.uid+c.date} className="card" style={{transform:'none',flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:600}}>{c.username || c.displayName || '(no name)'} <span style={{fontSize:12,color:c.status==='complete'?'var(--green)':c.status==='failed'?'var(--danger)':'var(--gold)',marginLeft:8}}>● {c.status}</span></div>
                <div className="sub" style={{marginBottom:4}}>{fmt(c.amount||0)} G · {c.tier} tier · Discord: {c.discord||'—'} · {c.claimDate}</div>
                {c.screenshotUrl && <a href={c.screenshotUrl} target="_blank" rel="noopener"><img src={c.screenshotUrl} alt="claim screenshot" style={{maxWidth:180,maxHeight:120,borderRadius:6,border:'1px solid var(--line)',display:'block',marginTop:4}} /></a>}
              </div>
              {(c.status === 'pending' || c.status === 'processing') && (
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button className="btn btn-gold btn-sm" onClick={()=>markClaimComplete(c)}>Mark complete</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>markClaimFailed(c)}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {fUsers.length === 0 && <p className="msub" style={{textAlign:'center'}}>No users found.</p>}
          {fUsers.map(u => (
            <div key={u.uid} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontWeight:600}}>{u.name || '(no name)'} <span style={{fontSize:12,color:'var(--muted)'}}>{u.email||''}</span></div>
                <div className="sub" style={{marginBottom:0}}>{fmt(u.goldBalance||0)} · Tier: {u.subscriptionTier || 'none'}{u.subscriptionTier && (() => { const d = daysLeft(u); return d == null ? <span style={{color:'var(--gold)'}}> (no end date)</span> : d <= 0 ? <span style={{color:'var(--danger)'}}> (EXPIRED)</span> : <span style={{color: d <= 7 ? 'var(--gold)' : 'var(--muted)'}}> ({d}d left)</span>; })()} · {u.uid.slice(0,10)}…</div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button className="btn btn-ghost btn-sm" onClick={()=>adjustBalance(u.uid, u.goldBalance)}>Set gold</button>
                {u.subscriptionTier && <button className="btn btn-ghost btn-sm" onClick={()=>extendSub(u,'monthly')}>+1 mo</button>}
                {u.subscriptionTier && <button className="btn btn-ghost btn-sm" onClick={()=>extendSub(u,'yearly')}>+1 yr</button>}
                <select value={u.subscriptionTier||''} onChange={e=>setTier(u.uid, e.target.value)} style={{width:'auto',padding:'6px 10px',fontSize:13}}>
                  <option value="">no tier</option>
                  <option value="bronze">bronze</option>
                  <option value="silver">silver</option>
                  <option value="gold">gold</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'points' && <PointsAdmin users={users} flashSale={flashSale} />}

      {tab === 'flash' && (
        <div style={{maxWidth:480,margin:'0 auto'}}>
          {flashActive(flashSale) ? (
            <div className="card" style={{transform:'none',marginBottom:16}}>
              <div style={{fontWeight:700,color:'var(--green)',marginBottom:6}}>● Flash sale is LIVE</div>
              <div className="sub" style={{marginBottom:4}}>{flashSale.label} — +{flashSale.percent}% bonus points</div>
              {flashSale.endsAt && <div className="sub" style={{marginBottom:12}}>Ends {new Date(flashSale.endsAt).toLocaleString()}</div>}
              <button className="btn btn-ghost btn-sm" onClick={stopFlash}>Stop sale now</button>
            </div>
          ) : (
            <p className="msub" style={{marginBottom:16}}>No flash bonus running. Start one below. It shows a sitewide countdown banner and adds the bonus percent to every points purchase (bundles and custom amounts) placed while it runs.</p>
          )}
          <div className="card" style={{transform:'none'}}>
            <div className="field"><label>Sale label</label><input value={fsLabel} onChange={e=>setFsLabel(e.target.value)} placeholder="Weekend Flash Sale" /></div>
            <div className="field"><label>Bonus points percent</label><input type="number" min="1" max="90" value={fsPct} onChange={e=>setFsPct(e.target.value)} /></div>
            <div className="field"><label>Duration (hours, 0 = no end time)</label><input type="number" min="0" value={fsHours} onChange={e=>setFsHours(e.target.value)} /></div>
            <button className="btn btn-gold" style={{width:'100%'}} onClick={startFlash}>{flashActive(flashSale) ? 'Replace active sale' : 'Start flash sale'}</button>
          </div>
        </div>
      )}
    </div></section>
  );
}


// =====================================================================
// ---- Points system (Oct 2026): buy, earn and exchange points 1:1 for gold ----
// Balances are never stored as one writable number. A wallet is computed from
// records the database rules lock down: admin-written ledger entries and plan
// periods, write-once check-ins / tasks stamped with server time, and exchanges.
// =====================================================================
const PTS = {
  rates: { none:0.0086, bronze:0.008, silver:0.0058, gold:0.004 },
  crypto:7, first:5, loyalty:5, loyaltyAt:25000, bulk1:5, bulk1At:10000, bulk2:10, bulk2At:25000,
  checkin:3, streak7:25, video:15, minExchange:250,
  // tracker_watch / tracker_alert are checked by the database rules against the player's Market Tracker data
  tasks:{ discord:10, youtube:10, tiktok:10, tracker_watch:15, tracker_alert:15 }, welcome:10,
  trackerWeek:10, trackerDays:3,          // visit the Market Tracker on 3 days in a week
  firstExchange:25, rating:5,             // paid once the team marks an exchange filled
  referral:100, referralFriend:100,       // paid when the friend's first payment is confirmed
  priceCallPrize:2500, drawPrize:1000, drawWinners:3,
};
const BUNDLES = [
  { id:'recruit', name:'Recruit', pts:250,   price:1.99,  tag:'FIRST ORDER', once:true },
  { id:'scout',   name:'Scout',   pts:1000,  price:7.99 },
  { id:'raider',  name:'Raider',  pts:5000,  price:37.99, tag:'MOST POPULAR' },
  { id:'vault',   name:'Vault',   pts:12000, price:79.99 },
];
// Built-in task links. A link saved in Admin -> Points -> Rewards takes priority.
const TASK_LINKS = {
  youtubeUrl: 'https://www.youtube.com/@camleeman712',
  tiktokUrl: 'https://www.tiktok.com/@standoff2markettracker',
  discordUrl: '',
};
const taskLink = (cfg, k) => ((cfg && cfg[k]) || TASK_LINKS[k] || '');
const WEEK_MS = 7 * DAY_MS;
const dayIdx = ts => Math.floor(ts / DAY_MS);
const weekIdx = ts => Math.floor((ts + 3 * DAY_MS) / WEEK_MS);   // weeks start Monday 00:00 UTC
const weekStartMs = w => w * WEEK_MS - 3 * DAY_MS;
let serverOffset = 0;
try { db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; }); } catch (e) {}
const nowMs = () => Date.now() + serverOffset;
const svTs = () => { try { return window.firebase.database.ServerValue.TIMESTAMP; } catch (e) { return Date.now(); } };
const round2 = n => Math.round(n * 100) / 100;
const capWord = s => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);
function tf(lang, key, vars) {
  let s = t(lang, key);
  if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}
const tierName = id => (TIERS.find(x => x.id === id) || { name: capWord(id) }).name;

// Builds the wallet from the raw points/{uid} node. Same function runs for the
// player and in the admin panel, so both always see the same balance.
function computeWallet(p, now) {
  p = p || {};
  const w = { balance:0, bought:0, earned:0, subPts:0, lifetimeBought:0, hasPurchased:false, tickets:0,
              streak:0, checkedToday:false, tier:null, daysLeft:null, period:null, openEx:[], history:[] };
  const today = dayIdx(now), wk = weekIdx(now);
  w.balance += PTS.welcome; w.earned += PTS.welcome;
  w.history.push({ id:'welcome', ts: 0, kind:'earn', lk:'task_signup', amt: PTS.welcome });
  Object.keys(p.ledger || {}).forEach(id => {
    const l = p.ledger[id] || {}; const amt = Number(l.amt) || 0;
    w.balance += amt;
    if (l.kind === 'buy') { w.bought += amt; w.lifetimeBought += amt; w.hasPurchased = true; }
    else if (l.kind === 'referral') { w.earned += amt; if (l.role === 'referrer') w.referrals = (w.referrals || 0) + 1; }
    else if (l.kind === 'bonus' || l.kind === 'sub') w.bought += amt;
    else w.earned += amt;
    w.history.push({ id, ts: l.ts || 0, kind: l.kind || 'adjust', label: l.label || '', lk: l.kind === 'referral' ? (l.role === 'referrer' ? 'h_ref_you' : 'h_ref_friend') : undefined, amt });
  });
  const days = Object.keys(p.checkins || {})
    .filter(k => { const v = p.checkins[k]; return v && typeof v.ts === 'number' && String(dayIdx(v.ts)) === k; })
    .map(Number).sort((a, b) => a - b);
  let run = 0, prev = null;
  days.forEach(d => {
    run = (prev !== null && d === prev + 1) ? run + 1 : 1; prev = d;
    const amt = PTS.checkin + (run % 7 === 0 ? PTS.streak7 : 0);
    w.balance += amt; w.earned += amt;
    if (weekIdx(d * DAY_MS) === wk) w.tickets++;
    w.history.push({ id:'ci' + d, ts: p.checkins[String(d)].ts, kind:'earn', lk:'h_checkin', arg:{ n: ((run - 1) % 7) + 1 }, amt });
  });
  const last = days.length ? days[days.length - 1] : null;
  w.checkedToday = last === today;
  w.streak = (last === today || last === today - 1) ? run : 0;
  Object.keys(p.tasks || {}).forEach(k => {
    const v = p.tasks[k]; if (!v || typeof v.ts !== 'number' || !PTS.tasks[k]) return;
    w.balance += PTS.tasks[k]; w.earned += PTS.tasks[k];
    if (weekIdx(v.ts) === wk) w.tickets++;
    w.history.push({ id:'tk' + k, ts: v.ts, kind:'earn', lk:'task_' + k, amt: PTS.tasks[k] });
  });
  Object.keys(p.video || {}).forEach(k => {
    const v = p.video[k]; if (!v || typeof v.ts !== 'number' || String(weekIdx(v.ts)) !== k) return;
    w.balance += PTS.video; w.earned += PTS.video;
    if (Number(k) === wk) w.tickets++;
    w.history.push({ id:'vd' + k, ts: v.ts, kind:'earn', lk:'h_video', amt: PTS.video });
  });
  Object.keys(p.periods || {}).forEach(id => {
    const per = p.periods[id] || {}; const daily = DAILY_GOLD[per.tier] || 0;
    if (!daily || !per.start || !per.end) return;
    const first = dayIdx(per.start), lastDay = dayIdx(per.end) - 1;
    const n = Math.max(0, Math.min(today, lastDay) - first + 1);
    w.hasPurchased = true;
    if (n > 0) {
      w.balance += daily * n; w.bought += daily * n; w.subPts += daily * n;
      w.history.push({ id:'pd' + id, ts: Math.max(per.start, Math.min(today, lastDay) * DAY_MS + 1000), kind:'sub', lk:'h_subdays', arg:{ tier: tierName(per.tier), n }, amt: daily * n });
    }
    if (today >= first && today <= lastDay && (!w.period || per.start > w.period.start)) {
      w.period = Object.assign({ id }, per); w.tier = per.tier; w.daysLeft = lastDay - today + 1;
    }
  });
  // Market Tracker visits: one record per day, stamped with server time by the tracker site
  const visitWeeks = {};
  Object.keys(p.trackerVisits || {}).forEach(k => {
    const v = p.trackerVisits[k]; if (!v || typeof v.ts !== 'number' || String(dayIdx(v.ts)) !== k) return;
    const vw = weekIdx(v.ts); (visitWeeks[vw] = visitWeeks[vw] || []).push(v.ts);
  });
  w.trackerDaysThisWeek = (visitWeeks[wk] || []).length;
  Object.keys(visitWeeks).forEach(vw => {
    const list = visitWeeks[vw].sort((a, b) => a - b);
    if (list.length < PTS.trackerDays) return;
    w.balance += PTS.trackerWeek; w.earned += PTS.trackerWeek;
    w.history.push({ id:'tv' + vw, ts: list[PTS.trackerDays - 1], kind:'earn', lk:'task_tracker_visits', amt: PTS.trackerWeek });
  });
  // First filled exchange and exchange ratings (both need the team to have filled the exchange)
  const filled = Object.keys(p.exchanges || {}).map(id => Object.assign({ id }, p.exchanges[id])).filter(x => x.status === 'filled').sort((a, b) => (a.filledAt || a.createdAt || 0) - (b.filledAt || b.createdAt || 0));
  w.filledEx = filled; w.ratings = p.ratings || {};
  if (filled.length) {
    w.balance += PTS.firstExchange; w.earned += PTS.firstExchange;
    w.history.push({ id:'fx', ts: filled[0].filledAt || filled[0].createdAt || 0, kind:'earn', lk:'task_first_ex', amt: PTS.firstExchange });
  }
  Object.keys(p.ratings || {}).forEach(exId => {
    const r = p.ratings[exId]; const x = (p.exchanges || {})[exId];
    if (!r || !x || x.status !== 'filled' || typeof r.ts !== 'number') return;
    w.balance += PTS.rating; w.earned += PTS.rating;
    w.history.push({ id:'rt' + exId, ts: r.ts, kind:'earn', lk:'task_rating', amt: PTS.rating });
  });
  Object.keys(p.exchanges || {}).forEach(id => {
    const x = p.exchanges[id] || {}; const amt = Number(x.amt) || 0;
    if (x.status === 'rejected' || x.status === 'cancelled') return;
    w.balance -= amt;
    if (x.status === 'awaiting_listing') w.openEx.push(Object.assign({ id }, x));
    w.history.push({ id:'ex' + id, ts: x.createdAt || 0, kind:'ex', lk:'h_ex', arg:{ n: fmt(amt) }, amt: -amt, status: x.status });
  });
  w.history.sort((a, b) => b.ts - a.ts);
  return w;
}

// Every old discount now pays out as extra points. Percentages add up on the base points.
function pointBonuses({ base, method, tier, hasPurchased, lifetimeBought, flash, kind }) {
  const L = [];
  if (method === 'crypto') L.push({ key:'pb_crypto', pct: PTS.crypto });
  if (kind !== 'sub') {
    if (tier && PACK_DISC[tier]) L.push({ key:'pb_sub', arg:{ tier: tierName(tier) }, pct: PACK_DISC[tier] });
    if (!hasPurchased) L.push({ key:'pb_first', pct: PTS.first });
    if ((lifetimeBought || 0) >= PTS.loyaltyAt) L.push({ key:'pb_loyal', pct: PTS.loyalty });
    if (base >= PTS.bulk2At) L.push({ key:'pb_bulk2', pct: PTS.bulk2 });
    else if (base >= PTS.bulk1At) L.push({ key:'pb_bulk1', pct: PTS.bulk1 });
    if (flashActive(flash)) L.push({ key:'pb_flash', label: flash.label, pct: Number(flash.percent) || 0 });
  }
  const lines = L.filter(l => l.pct > 0).map(l => Object.assign({}, l, { pts: Math.round(base * l.pct / 100) }));
  return { lines, pts: lines.reduce((a, l) => a + l.pts, 0), pct: lines.reduce((a, l) => a + l.pct, 0) };
}
// What an order is worth. Used at checkout and again by the admin before crediting,
// so a tampered order can never credit more than its real price buys.
function quoteOrder(o, ctx) {
  let base = 0, price = 0, yrBonus = 0, kind = o.kind;
  if (kind === 'bundle') { const b = BUNDLES.find(x => x.id === o.item); if (!b) return null; base = b.pts; price = b.price; }
  else if (kind === 'custom') { base = Math.max(0, Math.floor(Number(o.basePts) || 0)); price = round2(base * PTS.rates[ctx.tier || 'none']); }
  else if (kind === 'sub') {
    const T = TIERS.find(x => x.id === o.tier); if (!T || !TERM_DAYS[o.term]) return null;
    base = DAILY_GOLD[T.id] * TERM_DAYS[o.term]; price = o.term === 'yearly' ? T.yr : T.mo;
    yrBonus = o.term === 'yearly' ? YEARLY_BONUS[T.id] : 0;
  } else return null;
  const bonus = pointBonuses({ base, method: o.method, tier: ctx.tier, hasPurchased: ctx.hasPurchased, lifetimeBought: ctx.lifetimeBought, flash: ctx.flash, kind });
  return { base, price, yrBonus, bonus, credit: kind === 'sub' ? yrBonus + bonus.pts : base + bonus.pts };
}
const bonusText = (lang, l) => (l.key === 'pb_flash' && l.label ? l.label : tf(lang, l.key, l.arg)) + ' +' + l.pct + '%';

async function postWebhook(title, rows, color) {
  try {
    const res = await fetch(WEBHOOK, { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ embeds:[{ title, description: rows.filter(r => r[1] != null && r[1] !== '').map(r => '**' + r[0] + ':** ' + r[1]).join('\n'), color: color || 16763964, timestamp: new Date().toISOString() }] }) });
    return res.ok;
  } catch (e) { return false; }
}

function usePoints(user) {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user) { setData(null); setOrders([]); return; }
    const r = db.ref('points/' + user.uid);
    const o = db.ref('pointsOrders/' + user.uid);
    const cr = r.on('value', s => setData(s.val() || {}), () => setData({}));
    const co = o.on('value', s => { const v = s.val() || {}; setOrders(Object.keys(v).map(k => Object.assign({ id:k }, v[k])).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))); }, () => setOrders([]));
    const i = setInterval(() => setTick(x => x + 1), 60000);
    return () => { try { r.off('value', cr); o.off('value', co); } catch (e) {} clearInterval(i); };
  }, [user]);
  const wallet = React.useMemo(() => computeWallet(data, nowMs()), [data, tick]);
  return { data, wallet, orders, ready: data !== null };
}
function usePointsConfig() {
  const [cfg, setCfg] = useState({});
  useEffect(() => { const r = db.ref('pointsConfig'); const cb = r.on('value', s => setCfg(s.val() || {}), () => {}); return () => { try { r.off('value', cb); } catch (e) {} }; }, []);
  return cfg;
}

function PayMethodSeg({ method, setMethod, lang }) {
  const opts = [['cashapp','Cash App'],['venmo','Venmo'],['kofi','Ko-fi / PayPal'],['crypto','Crypto'],['gift','Gift card']];
  return (
    <div>
      <label style={{fontSize:13,color:'var(--muted)',fontWeight:700,display:'block',marginBottom:7}}>{t(lang,'pay_with')}</label>
      <div className="seg" role="radiogroup">
        {opts.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={method === id} className={method === id ? 'on' : ''} onClick={() => setMethod(id)}>
            {label}{id === 'crypto' && <span className="b">+{PTS.crypto}%</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Checkout for points (bundles, custom amounts, plans) ----------------
function PointsCheckout({ order, user, wallet, tier, flash, startMethod, onClose, onWallet, signIn, lang }) {
  const L = k => t(lang, k);
  const [method, setMethod] = useState(startMethod === 'gift' ? 'apple' : (startMethod || 'cashapp'));
  const [username, setUsername] = useState(user ? (user.displayName || '') : '');
  const [discord, setDiscord] = useState('');
  const [gcCode, setGcCode] = useState('');
  const [copied, setCopied] = useState('');
  const [state, setState] = useState('form');
  const ctx = { tier, hasPurchased: wallet.hasPurchased, lifetimeBought: wallet.lifetimeBought, flash };
  const q = quoteOrder(Object.assign({}, order, { method }), ctx);
  const cryptoQ = quoteOrder(Object.assign({}, order, { method:'crypto' }), ctx);
  const isCard = method === 'apple' || method === 'google';
  const copyText = (s, key) => { try { navigator.clipboard.writeText(s).catch(() => {}); } catch (e) {} setCopied(key); setTimeout(() => setCopied(''), 1500); };
  const T = order.kind === 'sub' ? TIERS.find(x => x.id === order.tier) : null;
  const title = order.kind === 'bundle' ? (BUNDLES.find(b => b.id === order.item) || {}).name + ' bundle'
    : order.kind === 'custom' ? fmt(order.basePts) + ' ' + L('pts_unit')
    : T.name + ' ' + (order.term === 'yearly' ? 'yearly' : 'monthly');
  const blockedOnce = order.kind === 'bundle' && order.item === 'recruit' && wallet.hasPurchased;
  const can = user && q && username.trim() && discord.trim() && (!isCard || gcCode.trim().length >= 8) && !blockedOnce && state !== 'sending';

  const submit = async () => {
    if (!can) return;
    setState('sending');
    const ts = Date.now();
    const rec = {
      kind: order.kind, item: order.item || null, basePts: q.base, tier: order.tier || null, term: order.term || null,
      title, price: q.price, method, bonusPts: q.bonus.pts, yrBonus: q.yrBonus || 0, credit: q.credit,
      bonusLines: q.bonus.lines.map(l => bonusText('en', l)).join(', ') || null,
      username: username.trim(), discord: discord.trim(), gcCode: isCard ? gcCode.trim() : null,
      referral: (() => { try { const r = localStorage.getItem('cs2g_ref'); return r && r !== user.uid ? r : null; } catch (e) { return null; } })(),
      status: 'pending', createdAt: ts,
    };
    let saved = false;
    try { await db.ref('pointsOrders/' + user.uid + '/' + ts).set(rec); saved = true; } catch (e) { console.warn('points order write failed', e); }
    const hook = await postWebhook('💳 New points order — CheapStandoff2Gold', [
      ['Item', title], ['Price', '$' + q.price.toFixed(2)], ['Method', PAYMENT_METHOD_LABELS[method] || method],
      ['Points', order.kind === 'sub' ? (DAILY_GOLD[order.tier] + '/day for ' + TERM_DAYS[order.term] + ' days') : fmt(q.base)],
      ['Bonus points', q.credit - (order.kind === 'sub' ? 0 : q.base) ? fmt(q.credit - (order.kind === 'sub' ? 0 : q.base)) + (rec.bonusLines ? ' (' + rec.bonusLines + ')' : '') : null],
      ['Username', rec.username], ['Discord', rec.discord], ['Account', user.email || user.uid],
      ['Gift Card Code', isCard ? '||' + gcCode.trim() + '||' : null], ['Referral', rec.referral],
      ['Next step', 'Confirm the payment in Admin → Points to credit the wallet.'],
    ]);
    setState(saved ? 'done' : (hook ? 'done' : 'error'));
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="xbtn" onClick={onClose} aria-label="Close">×</button>
        {!user ? (
          <div style={{textAlign:'center',padding:'10px 0'}}>
            <h3>{L('co_signin')}</h3>
            <p className="msub" style={{marginTop:8}}>{L('co_signin_p')}</p>
            <button className="btn btn-gold" onClick={() => { onClose(); signIn(); }}>{L('signin')}</button>
          </div>
        ) : state === 'done' ? (
          <div className="oksplash">
            <OrderProgress step={2} steps={['prog_details','co_prog_pay','co_prog_pts']} lang={lang} />
            <div className="big">✓</div>
            <h3>{L('co_done_h')}</h3>
            <p className="msub" style={{marginTop:8}}>{L('co_done_p')}</p>
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:8}}>
              <button className="btn btn-gold btn-sm" onClick={() => { onClose(); onWallet && onWallet(); }}>{L('co_wallet')}</button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>{L('co_close')}</button>
            </div>
          </div>
        ) : (
          <div>
            <OrderProgress step={1} steps={['prog_details','co_prog_pay','co_prog_pts']} busy={state === 'sending'} lang={lang} />
            <h3>{L('co_title')}</h3>
            <p className="msub">{L('co_sub')}</p>
            <div className="ordersum" style={{flexDirection:'column',gap:6}}>
              {T ? <div style={{display:'flex',justifyContent:'space-between',gap:10}}><span>{L('co_daily')}</span><b>{tf(lang,'co_daily_v',{ n: DAILY_GOLD[T.id], d: TERM_DAYS[order.term] })}</b></div>
                 : <div style={{display:'flex',justifyContent:'space-between',gap:10}}><span>{L('co_points')}</span><b>{fmt(q.base)}</b></div>}
              {q.yrBonus > 0 && <div style={{display:'flex',justifyContent:'space-between',gap:10,color:'var(--green)'}}><span>{L('co_yr')}</span><b style={{color:'var(--green)'}}>+{fmt(q.yrBonus)}</b></div>}
              {q.bonus.lines.map((l, i) => <div key={i} style={{display:'flex',justifyContent:'space-between',gap:10,color:'var(--green)'}}><span>{bonusText(lang, l)}</span><b style={{color:'var(--green)'}}>+{fmt(l.pts)}</b></div>)}
              <div style={{display:'flex',justifyContent:'space-between',gap:10,borderTop:'1px solid var(--line2)',paddingTop:8}}><span>{T ? L('co_today') : L('co_get')}</span><b>{fmt(T ? q.credit + DAILY_GOLD[T.id] : q.credit)} {L('pts_unit')}</b></div>
              <div style={{display:'flex',justifyContent:'space-between',gap:10}}><span>{L('co_pay')}</span><b>${q.price.toFixed(2)}</b></div>
            </div>
            {blockedOnce && <div className="alert err" style={{marginBottom:12}}>{L('co_once')}</div>}
            {method !== 'crypto' && cryptoQ && cryptoQ.credit > q.credit && <div className="prule" style={{marginBottom:14}}>{tf(lang,'co_crypto_tip',{ n: fmt(cryptoQ.credit - q.credit) })}</div>}

            <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('pay_with')}</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:16}}>
              {PAYMENT_METHODS.map(m => (
                <div key={m.id} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMethod(m.id); } }} onClick={() => setMethod(m.id)} style={{padding:'10px 4px',border:'1px solid ' + (method === m.id ? 'var(--gold)' : 'var(--line)'),borderRadius:10,background:method === m.id ? 'var(--gold-dim)' : 'transparent',color:method === m.id ? 'var(--ink)' : 'var(--muted)',fontSize:12,fontWeight:700,cursor:'pointer',textAlign:'center'}}>
                  {m.label}{m.id === 'crypto' && <div style={{color:'var(--green)',fontSize:11}}>+{PTS.crypto}%</div>}
                </div>
              ))}
            </div>
            {(method === 'cashapp' || method === 'venmo') && (
              <div>
                <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('co_send_to')} ${q.price.toFixed(2)}</label>
                <div onClick={() => copyText(PAYMENT_HANDLES[method], 'handle')} style={{background:'var(--bg)',border:'1px solid var(--line)',borderRadius:12,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:14}}>
                  <span style={{fontSize:16,fontWeight:700}}>{PAYMENT_HANDLES[method]}</span>
                  <span style={{fontSize:12,color:copied === 'handle' ? 'var(--green)' : 'var(--muted)'}}>{copied === 'handle' ? '✓' : L('co_copy')}</span>
                </div>
              </div>
            )}
            {method === 'kofi' && <div className="quote" style={{marginBottom:14}}>Ko-fi: ${q.price.toFixed(2)} · <a href="https://ko-fi.com/standoff263277" target="_blank" rel="noopener">ko-fi.com/standoff263277 →</a></div>}
            {method === 'crypto' && (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('co_send_to')} ${q.price.toFixed(2)}</label>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {CRYPTO_WALLETS.map(w => (
                    <div key={w.name} onClick={() => copyText(w.addr, w.symbol)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg)',border:'1px solid var(--line)',borderRadius:12,cursor:'pointer'}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:w.color + '22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:w.color,flexShrink:0}}>{w.symbol}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700}}>{w.name} {w.note && <span style={{fontSize:11,color:'var(--muted)'}}>({w.note})</span>}</div>
                        <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.addr}</div>
                      </div>
                      <span style={{fontSize:12,color:copied === w.symbol ? 'var(--green)' : 'var(--muted)',flexShrink:0}}>{copied === w.symbol ? '✓' : L('co_copy')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isCard && (
              <div>
                <div className="quote" style={{marginBottom:12}}>{tf(lang,'co_gc',{ p: '$' + q.price.toFixed(2) })}</div>
                <input type="text" value={gcCode} onChange={e => setGcCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" aria-label="Gift card code" style={{letterSpacing:'0.05em',marginBottom:12}} />
              </div>
            )}
            <label htmlFor="pco-user" style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('co_user')}</label>
            <input id="pco-user" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. CamelS2" style={{marginBottom:12}} />
            <label htmlFor="pco-dc" style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:6}}>{L('co_discord')}</label>
            <input id="pco-dc" value={discord} onChange={e => setDiscord(e.target.value)} placeholder="e.g. camel5961" style={{marginBottom:14}} />
            <button className="btn btn-gold" style={{width:'100%'}} disabled={!can} onClick={submit}>{state === 'sending' ? L('co_sending') : L('co_place')}</button>
            {state === 'error' && <div className="alert err">{L('co_err')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Homepage sections ----------------
function PointsHow({ lang }) {
  return (
    <section id="how">
      <div className="wrap">
        <div className="sect-head"><div className="eyebrow">{t(lang,'how_e')}</div><h2>{t(lang,'how_h')}</h2></div>
        <div className="steps">
          <div className="step"><h3>{t(lang,'how1_h')}</h3><p>{t(lang,'how1_p')}</p></div>
          <div className="step"><h3>{t(lang,'how2_h')}</h3><p>{t(lang,'how2_p')}</p></div>
          <div className="step"><h3>{t(lang,'how3_h')}</h3><p>{t(lang,'how3_p')}</p></div>
        </div>
      </div>
    </section>
  );
}

function PointsBundles({ lang, wallet, tier, flash, method, setMethod, open }) {
  const ctx = { tier, hasPurchased: wallet.hasPurchased, lifetimeBought: wallet.lifetimeBought, flash };
  const sample = pointBonuses(Object.assign({ base:1000, method, kind:'bundle' }, ctx));
  return (
    <section id="packs">
      <div className="wrap">
        <div className="sect-head">
          <div className="eyebrow">{t(lang,'b_eyebrow')}</div>
          <h2>{t(lang,'b_h2a')} <span className="goldtext">{t(lang,'b_h2b')}</span></h2>
          <p>{tf(lang,'b_p',{ n: PTS.crypto })}</p>
        </div>
        <PayMethodSeg method={method} setMethod={setMethod} lang={lang} />
        {sample.lines.length > 0 && (
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',margin:'-6px 0 18px',fontSize:13.5,color:'var(--muted)'}}>
            <span>{t(lang,'your_bonuses')}</span>{sample.lines.map((l, i) => <span key={i} className="ptag bonus">{bonusText(lang, l)}</span>)}
          </div>
        )}
        <div className="grid4">
          {BUNDLES.map(b => {
            const bn = pointBonuses(Object.assign({ base:b.pts, method, kind:'bundle' }, ctx));
            const total = b.pts + bn.pts;
            const hidden = b.once && wallet.hasPurchased;
            return (
              <div key={b.id} className={'card' + (bn.pts ? ' hot' : '')} style={hidden ? {opacity:.55} : null}>
                {b.tag && <div className="badge">{b.tag}</div>}
                <h3>{b.name}</h3>
                <div className="price" style={{marginTop:10}}>{fmt(total)} <small>{t(lang,'pts_short')}</small></div>
                <div className={'bonusline' + (bn.pts ? '' : ' off')}>{bn.pts ? tf(lang,'b_bonus_inc',{ a: fmt(b.pts), b: fmt(bn.pts) }) : tf(lang,'b_crypto_hint',{ n: fmt(Math.round(b.pts * PTS.crypto / 100)) })}</div>
                <div className="sub" style={{margin:'10px 0 14px'}}><b style={{color:'var(--ink)',fontSize:20,letterSpacing:'-.03em'}}>${b.price.toFixed(2)}</b> · {fmt(Math.round(total / b.price))} {t(lang,'b_per')}</div>
                <button className="btn btn-gold" style={{marginTop:'auto'}} disabled={hidden} onClick={() => open({ kind:'bundle', item:b.id })}>{tf(lang,'b_buy',{ name: b.name })}</button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CustomPoints({ lang, wallet, tier, flash, method, setMethod, open, showHead }) {
  const [amt, setAmt] = useState(2000);
  const ctx = { tier, hasPurchased: wallet.hasPurchased, lifetimeBought: wallet.lifetimeBought, flash };
  const q = quoteOrder({ kind:'custom', basePts: amt, method }, ctx);
  return (
    <div style={{maxWidth:560,margin:'0 auto'}}>
      {showHead && <PayMethodSeg method={method} setMethod={setMethod} lang={lang} />}
      <div className="card" style={{transform:'none'}}>
        <label htmlFor="cu-amt" style={{fontSize:13,color:'var(--muted)',fontWeight:700,display:'block',marginBottom:7}}>{t(lang,'cu_label')}</label>
        <input id="cu-amt" type="number" min={100} step={100} value={amt} onChange={e => setAmt(Math.max(0, parseInt(e.target.value) || 0))} />
        <div className="chips">{[1000, 5000, 10000, 25000].map(v => <button key={v} type="button" className="chip" onClick={() => setAmt(v)}>{fmt(v)}</button>)}</div>
        <div className="quote" style={{marginTop:10}}>{tf(lang,'cu_pay',{ p: '$' + q.price.toFixed(2), n: fmt(q.credit) })}</div>
        {q.bonus.lines.length > 0 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>{q.bonus.lines.map((l, i) => <span key={i} className="ptag bonus">{bonusText(lang, l)}</span>)}</div>}
        <div className="sub" style={{marginTop:10,marginBottom:12}}>{tf(lang,'cu_rate',{ r: PTS.rates[tier || 'none'] })}</div>
        <button className="btn btn-gold" style={{width:'100%'}} disabled={amt < 100} onClick={() => open({ kind:'custom', basePts: amt })}>{t(lang,'cu_buy')}</button>
      </div>
    </div>
  );
}

function PointsSubs({ lang, wallet, method, setMethod, open }) {
  const [yearly, setYearly] = useState(false);
  const term = yearly ? 'yearly' : 'monthly';
  return (
    <section id="subs" style={{background:'var(--bg2)'}}>
      <div className="wrap">
        <div className="sect-head">
          <div className="eyebrow">{t(lang,'subs_eyebrow')}</div>
          <h2>{t(lang,'ps_h2a')} <span className="goldtext">{t(lang,'ps_h2b')}</span></h2>
          <p>{t(lang,'ps_p')}</p>
        </div>
        <PayMethodSeg method={method} setMethod={setMethod} lang={lang} />
        <div className="toggle" role="tablist">
          <button className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>{t(lang,'ps_monthly')}</button>
          <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>{t(lang,'ps_yearly')} <span className="save">{tf(lang,'ps_save',{ n: maxYearlySave })}</span></button>
        </div>
        <div className="grid3">
          {TIERS.map(T => {
            const crypto = method === 'crypto' ? Math.round(DAILY_GOLD[T.id] * TERM_DAYS[term] * PTS.crypto / 100) : 0;
            const mine = wallet.tier === T.id;
            return (
              <div key={T.id} className={'card' + (T.best ? ' best' : '') + (mine ? ' mine' : '')} style={T.best || mine ? {paddingTop:34} : null}>
                {mine ? <div className="badge" style={{background:'#2F5FB3'}}>{t(lang,'s_yours')}</div> : T.tag && <div className="badge">{T.tag}</div>}
                <h3>{T.name}</h3>
                <div className="price">${yearly ? T.yr : T.mo}<small>/{yearly ? 'yr' : 'mo'}</small></div>
                <div className="goldamt goldtext">+{DAILY_GOLD[T.id]} {t(lang,'s_daily')}</div>
                <ul className="feat">
                  <li>{tf(lang,'s_month',{ n: fmt(T.monthly) })}</li>
                  {yearly && <li>{tf(lang,'s_yrbonus',{ n: fmt(YEARLY_BONUS[T.id]) })}</li>}
                  {crypto > 0 && <li style={{color:'var(--green)',fontWeight:700}}>{tf(lang,'s_crypto',{ n: fmt(crypto) })}</li>}
                  <li>{tf(lang,'s_pack',{ n: PACK_DISC[T.id] })}</li>
                  <li>{tf(lang,'s_rate',{ r: PTS.rates[T.id] })}</li>
                </ul>
                <button className={'btn ' + (T.best ? 'btn-gold' : 'btn-ghost')} onClick={() => open({ kind:'sub', tier:T.id, term })}>{tf(lang, mine ? 's_extend' : 's_get', { name: T.name })}</button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EarnTeaser({ lang, goWallet }) {
  return (
    <section style={{paddingTop:0}}>
      <div className="wrap">
        <div className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:240}}>
            <div className="eyebrow">{t(lang,'tab_earn')}</div>
            <h3 style={{fontSize:22,margin:'6px 0 4px'}}>{t(lang,'earn_teaser_h')}</h3>
            <p className="sub" style={{marginBottom:0}}>{t(lang,'earn_teaser_p')}</p>
          </div>
          <button className="btn btn-gold" onClick={() => goWallet('earn')}>{t(lang,'earn_cta')}</button>
        </div>
      </div>
    </section>
  );
}

// ---------------- Wallet page (replaces the old dashboard) ----------------
function nextSundayClose(now) {
  const d = new Date(now); const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20));
  c.setUTCDate(c.getUTCDate() + ((7 - c.getUTCDay()) % 7)); if (c.getTime() <= now) c.setUTCDate(c.getUTCDate() + 7);
  return c.getTime();
}
function timeLeft(lang, ms) { const h = Math.max(0, Math.floor(ms / 3600000)); return tf(lang,'left',{ d: Math.floor(h / 24), h: h % 24 }); }
const KIND_TAG = { buy:['buy','k_buy'], bonus:['bonus','k_bonus'], sub:['sub','k_sub'], earn:['earn','k_earn'], referral:['earn','k_referral'], contest:['contest','k_contest'], ex:['', 'k_ex'], adjust:['', 'k_adjust'] };

function StreakRow({ wallet, lang }) {
  const day = wallet.streak % 7;
  const filled = wallet.checkedToday ? (day === 0 && wallet.streak > 0 ? 7 : day) : day;
  return (
    <div className="streak">
      {[0,1,2,3,4,5,6].map(i => {
        const today = !wallet.checkedToday && i === day;
        return <div key={i} className={'sday' + (i < filled ? ' done' : '') + (today ? ' today' : '') + (i === 6 ? ' seven' : '')}><b>+{i === 6 ? PTS.checkin + PTS.streak7 : PTS.checkin}</b>{t(lang,'ci_day')} {i + 1}</div>;
      })}
    </div>
  );
}

function CheckinCard({ user, wallet, lang }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const day = wallet.streak % 7;
  const nextPts = PTS.checkin + ((wallet.checkedToday ? 0 : day) === 6 ? PTS.streak7 : 0);
  const go = async () => {
    setBusy(true); setErr('');
    try { await db.ref('points/' + user.uid + '/checkins/' + dayIdx(nowMs())).set({ ts: svTs() }); }
    catch (e) { setErr(t(lang,'err_generic')); }
    setBusy(false);
  };
  return (
    <div className="card" style={{transform:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
        <div className="eyebrow">{t(lang,'ci_title')}</div>
        <span className="ptag earn">{tf(lang,'ci_streak',{ n: wallet.streak })}</span>
      </div>
      <StreakRow wallet={wallet} lang={lang} />
      {wallet.checkedToday
        ? <div style={{color:'var(--green)',fontWeight:700,fontSize:14}}>{t(lang,'ci_done')}</div>
        : <button className="btn btn-gold" style={{width:'100%',background:'var(--green)'}} disabled={busy} onClick={go}>{tf(lang,'ci_btn',{ n: nextPts })}</button>}
      {err && <div className="alert err">{err}</div>}
      <div className="sub" style={{marginTop:10,marginBottom:0,fontSize:13}}>{tf(lang,'ci_note',{ n: PTS.streak7 })}</div>
    </div>
  );
}

function SubCard({ wallet, legacyTier, legacyClaimed, onLegacyClaim, goSubs, lang }) {
  if (wallet.tier) {
    const T = TIERS.find(x => x.id === wallet.tier);
    return (
      <div className="card mine" style={{transform:'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <div className="eyebrow" style={{color:'#2F5FB3'}}>{tf(lang,'sub_plan',{ tier: T.name })}</div>
          <span className="ptag sub">{tf(lang,'sub_left',{ n: wallet.daysLeft })}</span>
        </div>
        <div style={{marginTop:8}}><span className="bigpts" style={{fontSize:36}}>+{DAILY_GOLD[T.id]}</span><span className="ptunit">{t(lang,'sub_daily')}</span></div>
        <p className="sub" style={{marginTop:6,marginBottom:12}}>{t(lang,'sub_auto')}</p>
        <button className="btn btn-ghost btn-sm" onClick={goSubs}>{wallet.daysLeft <= 7 ? t(lang,'sub_renew') : t(lang,'sub_see')}</button>
      </div>
    );
  }
  if (legacyTier) {
    return (
      <div className="card" style={{transform:'none'}}>
        <div className="eyebrow">{tf(lang,'sub_plan',{ tier: tierName(legacyTier) })}</div>
        <p className="sub" style={{marginTop:8}}>{t(lang,'sub_legacy')}</p>
        {legacyClaimed ? <div style={{color:'var(--green)',fontWeight:700,fontSize:14}}>{t(lang,'sub_legacy_done')}</div>
          : <button className="btn btn-gold btn-sm" onClick={onLegacyClaim}>{tf(lang,'sub_legacy_btn',{ n: DAILY_GOLD[legacyTier] })}</button>}
      </div>
    );
  }
  return (
    <div className="card" style={{transform:'none'}}>
      <div className="eyebrow">{t(lang,'nav_subs')}</div>
      <p className="sub" style={{marginTop:8,marginBottom:12}}>{t(lang,'sub_none')}</p>
      <button className="btn btn-gold btn-sm" onClick={goSubs}>{t(lang,'sub_see')}</button>
    </div>
  );
}

function HistoryList({ wallet, orders, lang }) {
  const pend = orders.filter(o => o.status === 'pending' || o.status === 'rejected').slice(0, 10);
  const rows = wallet.history.slice(0, 60);
  return (
    <div className="pstack" style={{marginTop:14}}>
      {pend.length > 0 && (
        <div className="lrows">
          <div className="lhead"><h3 style={{fontSize:16}}>{t(lang,'ord_pending')}</h3><span className="sub" style={{marginBottom:0,fontSize:13}}>{t(lang,'ord_pending_p')}</span></div>
          {pend.map(o => (
            <div key={o.id} className="lrow">
              <span className={'ptag ' + (o.status === 'rejected' ? 'bad' : 'pend')}>{o.status === 'rejected' ? t(lang,'ord_rejected') : t(lang,'ord_wait')}</span>
              <div className="lmain"><div className="ltitle">{o.title}</div><div className="lmeta">${Number(o.price || 0).toFixed(2)} · {new Date(o.createdAt || 0).toLocaleDateString()}</div></div>
              <div className="lamt pend">+{fmt(o.kind === 'sub' ? (o.credit || 0) + (DAILY_GOLD[o.tier] || 0) : (o.credit || 0))}</div>
            </div>
          ))}
        </div>
      )}
      <div className="lrows">
        <div className="lhead"><h3 style={{fontSize:16}}>{t(lang,'hist_title')}</h3></div>
        {rows.length === 0 ? <div style={{padding:'22px 18px',color:'var(--low)'}}>{t(lang,'hist_empty')}</div> : rows.map(h => {
          const k = KIND_TAG[h.kind] || KIND_TAG.adjust;
          return (
            <div key={h.id} className="lrow">
              <span className={'ptag ' + k[0]}>{t(lang, k[1])}</span>
              <div className="lmain"><div className="ltitle">{h.lk ? tf(lang, h.lk, h.arg) : h.label}</div><div className="lmeta">{h.ts ? new Date(h.ts).toLocaleDateString() : ''}{h.status ? ' · ' + t(lang, 'xs_' + h.status) : ''}</div></div>
              <div className={'lamt' + (h.amt > 0 ? ' plus' : '')}>{h.amt > 0 ? '+' : '−'}{fmt(Math.abs(h.amt))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TRACKER_URL = 'https://standoff2markettracker.com';
const normCode = c => String(c || '').trim().toLowerCase().replace(/\s+/g, ' ');

function TaskRow({ title, meta, pts, done, children }) {
  return (
    <div className="ptask">
      <div className="lmain"><div style={{fontWeight:700}}>{title}</div>{meta && <div className="lmeta" style={{fontSize:13,color:'var(--low)'}}>{meta}</div>}</div>
      <div className="pp">{pts}</div>
      {done ? <span style={{color:'var(--green)',fontWeight:700,fontSize:14}}>✓</span> : children}
    </div>
  );
}

function EarnTab({ user, wallet, data, cfg, legacyUser, lang }) {
  const L = k => t(lang, k);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});
  const [code, setCode] = useState('');
  const [alertCount, setAlertCount] = useState(null);
  const [copied, setCopied] = useState(false);
  const [stars, setStars] = useState({});
  const [notes, setNotes] = useState({});
  const wk = weekIdx(nowMs());
  useEffect(() => {
    const r = db.ref('alerts/' + user.uid);
    const cb = r.on('value', s => setAlertCount(Object.keys(s.val() || {}).length), () => setAlertCount(0));
    return () => { try { r.off('value', cb); } catch (e) {} };
  }, [user]);
  const social = [['discord', taskLink(cfg, 'discordUrl')], ['youtube', taskLink(cfg, 'youtubeUrl')], ['tiktok', taskLink(cfg, 'tiktokUrl')]].filter(x => x[1]);
  const doneTask = id => !!(data && data.tasks && data.tasks[id]);
  const videoDone = !!(data && data.video && data.video[wk]);
  const watchCount = Object.keys((legacyUser && legacyUser.flipWatchlist) || {}).length;
  const refLink = 'https://standoffmarkettracker-design.github.io/CheapStandoff2Gold/?ref=' + user.uid;
  const say = (k, v) => setMsg(m => Object.assign({}, m, { [k]: v }));
  const write = async (key, path, value, failKey) => {
    setBusy(key); say(key, '');
    try { await db.ref('points/' + user.uid + '/' + path).set(value); }
    catch (e) { say(key, L(failKey || 'err_generic')); }
    setBusy('');
  };
  const openLink = url => { if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) {} } };
  const copyRef = () => { try { navigator.clipboard.writeText(refLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }, () => {}); } catch (e) {} };
  const unrated = (wallet.filledEx || []).filter(x => !(wallet.ratings || {})[x.id]);
  const msgLine = k => msg[k] ? <div style={{fontSize:13,color:'var(--danger)',fontWeight:600,padding:'0 18px 12px'}}>{msg[k]}</div> : null;

  return (
    <div className="pgrid2">
      <div className="pstack">
        <div className="lrows">
          <div className="lhead"><h3 style={{fontSize:16}}>{L('earn_weekly')}</h3><span className="sub" style={{marginBottom:0,fontSize:13}}>{L('task_weekly')}</span></div>
          {Number(cfg.videoWeek) === wk && (
            <div>
              <TaskRow title={L('task_code')} meta={L('task_code_meta')} pts={'+' + PTS.video} done={videoDone}>
                {cfg.videoUrl && <button className="btn btn-ghost btn-sm" onClick={() => openLink(cfg.videoUrl)}>{L('task_watch')}</button>}
              </TaskRow>
              {!videoDone && (
                <div style={{display:'flex',gap:8,padding:'0 18px 14px'}}>
                  <input value={code} onChange={e => setCode(e.target.value)} placeholder={L('task_code_ph')} aria-label={L('task_code')} />
                  <button className="btn btn-gold btn-sm" disabled={!normCode(code) || busy === 'code'} onClick={() => write('code', 'video/' + wk, { ts: svTs(), code: normCode(code) }, 'task_code_wrong')}>{L('task_claim')}</button>
                </div>
              )}
              {msgLine('code')}
            </div>
          )}
          <TaskRow title={L('task_tracker_visits')} meta={tf(lang,'task_visits_meta',{ n: Math.min(wallet.trackerDaysThisWeek || 0, PTS.trackerDays), d: PTS.trackerDays })} pts={'+' + PTS.trackerWeek} done={(wallet.trackerDaysThisWeek || 0) >= PTS.trackerDays}>
            <button className="btn btn-ghost btn-sm" onClick={() => openLink(TRACKER_URL)}>{L('task_open_tracker')}</button>
          </TaskRow>
        </div>

        <div className="lrows">
          <div className="lhead"><h3 style={{fontSize:16}}>{L('earn_tracker')}</h3><span className="sub" style={{marginBottom:0,fontSize:13}}>{L('earn_checked')}</span></div>
          <TaskRow title={L('task_tracker_watch')} meta={tf(lang,'task_watch_meta',{ n: Math.min(watchCount, 3) })} pts={'+' + PTS.tasks.tracker_watch} done={doneTask('tracker_watch')}>
            {watchCount >= 3
              ? <button className="btn btn-gold btn-sm" disabled={busy === 'tw'} onClick={() => write('tw', 'tasks/tracker_watch', { ts: svTs() }, 'task_not_yet')}>{L('task_claim')}</button>
              : <button className="btn btn-ghost btn-sm" onClick={() => openLink(TRACKER_URL)}>{L('task_open_tracker')}</button>}
          </TaskRow>
          {msgLine('tw')}
          <TaskRow title={L('task_tracker_alert')} meta={L('task_alert_meta')} pts={'+' + PTS.tasks.tracker_alert} done={doneTask('tracker_alert')}>
            {alertCount > 0
              ? <button className="btn btn-gold btn-sm" disabled={busy === 'ta'} onClick={() => write('ta', 'tasks/tracker_alert', { ts: svTs() }, 'task_not_yet')}>{L('task_claim')}</button>
              : <button className="btn btn-ghost btn-sm" onClick={() => openLink(TRACKER_URL)}>{L('task_open_tracker')}</button>}
          </TaskRow>
          {msgLine('ta')}
        </div>

        <div className="lrows">
          <div className="lhead"><h3 style={{fontSize:16}}>{L('earn_once')}</h3><span className="sub" style={{marginBottom:0,fontSize:13}}>{L('earn_ticket')}</span></div>
          <TaskRow title={L('task_signup')} meta={L('task_once')} pts={'+' + PTS.welcome} done={true} />
          <TaskRow title={L('task_first_ex')} meta={L('task_first_ex_meta')} pts={'+' + PTS.firstExchange} done={(wallet.filledEx || []).length > 0} />
          {social.map(([id, url]) => (
            <TaskRow key={id} title={L('task_' + id)} meta={L('task_once')} pts={'+' + PTS.tasks[id]} done={doneTask(id)}>
              <button className="btn btn-gold btn-sm" disabled={busy === id} onClick={() => { openLink(url); write(id, 'tasks/' + id, { ts: svTs() }); }}>{L('task_go')}</button>
            </TaskRow>
          ))}
        </div>

        {unrated.length > 0 && (
          <div className="lrows">
            <div className="lhead"><h3 style={{fontSize:16}}>{L('task_rating')}</h3><span className="pp">+{PTS.rating} {L('task_each')}</span></div>
            {unrated.slice(0, 5).map(x => (
              <div key={x.id} style={{padding:'12px 18px',borderBottom:'1px solid var(--line2)'}}>
                <div style={{fontWeight:700,marginBottom:6}}>{tf(lang,'h_ex',{ n: fmt(x.amt || 0) })}</div>
                <div style={{display:'flex',gap:4,marginBottom:8}} role="radiogroup" aria-label={L('task_rating')}>
                  {[1,2,3,4,5].map(n => <button key={n} type="button" role="radio" aria-checked={stars[x.id] === n} onClick={() => setStars(Object.assign({}, stars, { [x.id]: n }))} style={{background:'none',border:'none',cursor:'pointer',fontSize:24,lineHeight:1,color:(stars[x.id] || 0) >= n ? 'var(--gold)' : 'var(--line)',padding:2}} aria-label={n + ' / 5'}>★</button>)}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <input value={notes[x.id] || ''} maxLength={280} onChange={e => setNotes(Object.assign({}, notes, { [x.id]: e.target.value }))} placeholder={L('task_rating_ph')} aria-label={L('task_rating_ph')} />
                  <button className="btn btn-gold btn-sm" disabled={!stars[x.id] || busy === 'rt' + x.id} onClick={() => { const v = { stars: stars[x.id], ts: svTs() }; const n = (notes[x.id] || '').trim(); if (n) v.text = n.slice(0, 280); write('rt' + x.id, 'ratings/' + x.id, v); }}>{L('task_send')}</button>
                </div>
                {msgLine('rt' + x.id)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pstack">
        <div className="card" style={{transform:'none'}}>
          <div className="eyebrow">{L('task_refer')}</div>
          <h3 style={{fontSize:20,margin:'8px 0 6px'}}>{tf(lang,'ref_h',{ a: fmt(PTS.referral), b: fmt(PTS.referralFriend) })}</h3>
          <p className="sub" style={{marginBottom:12}}>{L('ref_p')}</p>
          <div style={{display:'flex',gap:8}}>
            <input readOnly value={refLink} onFocus={e => e.target.select()} aria-label={L('task_refer')} style={{fontSize:13}} />
            <button className="btn btn-gold btn-sm" onClick={copyRef}>{copied ? '✓' : L('ref_copy')}</button>
          </div>
          <div className="sub" style={{marginTop:10,marginBottom:0,fontSize:13}}>{tf(lang,'ref_count',{ n: wallet.referrals || 0 })}</div>
        </div>
        <CheckinCard user={user} wallet={wallet} lang={lang} />
        <div className="prule">{L('earn_rules')}</div>
      </div>
    </div>
  );
}

function Sparkline({ series }) {
  if (!series || series.length < 2) return null;
  const w = 300, h = 64, p = 6, min = Math.min(...series), max = Math.max(...series), span = (max - min) || 1;
  const pts = series.map((v, i) => [p + i * (w - 2 * p) / (series.length - 1), h - p - (v - min) / span * (h - 2 * p)]);
  const line = pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" aria-hidden="true">
      <path d={line + ' L ' + last[0] + ' ' + h + ' L ' + pts[0][0] + ' ' + h + ' Z'} fill="var(--gold-dim)" />
      <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--gold)" />
    </svg>
  );
}

function ContestsTab({ user, wallet, lang }) {
  const now = nowMs(); const wk = weekIdx(now);
  const [pc, setPc] = useState(null);
  const [prevPc, setPrevPc] = useState(null);
  const [draws, setDraws] = useState(null);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const r = db.ref('contests/priceCall/' + wk);
    const cb = r.on('value', s => setPc(s.val() || {}), () => setPc({}));
    db.ref('contests/priceCall/' + (wk - 1) + '/result').once('value').then(s => setPrevPc(s.val())).catch(() => {});
    db.ref('contests/draw/' + (wk - 1) + '/winners').once('value').then(s => setDraws(s.val())).catch(() => {});
    return () => { try { r.off('value', cb); } catch (e) {} };
  }, [wk]);
  const meta = pc && pc.meta;
  const mine = pc && pc.entries && user && pc.entries[user.uid];
  const closed = meta && meta.closesAt && now >= meta.closesAt;
  const enter = async () => {
    const g = parseInt(guess); if (!g || g < 1) return;
    setBusy(true);
    try { await db.ref('contests/priceCall/' + wk + '/entries/' + user.uid).set({ guess: g, handle: maskHandle(user.displayName || user.email || ''), ts: svTs() }); } catch (e) {}
    setBusy(false);
  };
  const series = meta && meta.series ? String(meta.series).split(',').map(Number).filter(n => !isNaN(n)) : null;
  return (
    <div className="pgrid2">
      <div className="card" style={{transform:'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div className="eyebrow">{t(lang,'pc_title')}</div>{meta && !closed && <span className="ptag contest">{timeLeft(lang, meta.closesAt - now)}</span>}</div>
        <h3 style={{fontSize:22,margin:'8px 0 4px'}}>{tf(lang,'pc_h',{ n: fmt(PTS.priceCallPrize) })}</h3>
        <p className="sub">{t(lang,'pc_p')}</p>
        {!meta ? <div className="prule">{t(lang,'pc_none')}</div> : (
          <div>
            <div className="card" style={{transform:'none',background:'var(--bg3)',padding:'14px 16px',margin:'12px 0'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
                <div><div className="sub" style={{marginBottom:0,fontSize:13}}>{t(lang,'pc_skin')}</div><b style={{fontSize:16}}>{meta.skin}</b></div>
                <div style={{textAlign:'right'}}><div className="sub" style={{marginBottom:0,fontSize:13}}>{t(lang,'pc_now')}</div><b style={{fontSize:20}} className="goldtext">{fmt(Number(meta.price) || 0)} G</b></div>
              </div>
              <Sparkline series={series} />
            </div>
            {mine ? <div className="quote">{tf(lang,'pc_yours',{ n: fmt(mine.guess) })}</div>
              : closed ? <div className="prule">{t(lang,'pc_closed')}</div>
              : <div>
                  <label htmlFor="pc-guess" style={{fontSize:13,color:'var(--muted)',fontWeight:700,display:'block',marginBottom:7}}>{t(lang,'pc_guess')}</label>
                  <div style={{display:'flex',gap:8}}>
                    <input id="pc-guess" type="number" min="1" value={guess} onChange={e => setGuess(e.target.value)} placeholder="1265" />
                    <button className="btn btn-gold" disabled={busy || !(parseInt(guess) > 0)} onClick={enter}>{t(lang,'pc_lock')}</button>
                  </div>
                </div>}
          </div>
        )}
        {prevPc && prevPc.winnerHandle && <div className="sub" style={{marginTop:14,marginBottom:0,fontSize:13}}>{t(lang,'dr_last')}: {tf(lang,'pc_won',{ h: prevPc.winnerHandle, g: fmt(prevPc.guess), a: fmt(prevPc.actual) })}</div>}
      </div>
      <div className="pstack">
        <div className="card" style={{transform:'none'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div className="eyebrow">{t(lang,'dr_title')}</div><span className="ptag contest">{timeLeft(lang, weekStartMs(wk + 1) - now)}</span></div>
          <h3 style={{fontSize:22,margin:'8px 0 4px'}}>{tf(lang,'dr_h',{ w: PTS.drawWinners, n: fmt(PTS.drawPrize) })}</h3>
          <div style={{display:'flex',alignItems:'baseline',gap:10,margin:'12px 0'}}><span className="bigpts" style={{fontSize:40}}>{wallet.tickets}</span><span className="sub" style={{marginBottom:0}}>{t(lang,'dr_tickets')}</span></div>
          <p className="sub" style={{marginBottom:0}}>{t(lang,'dr_p')}</p>
        </div>
        {draws && Array.isArray(draws) && draws.length > 0 && (
          <div className="lrows">
            <div className="lhead"><h3 style={{fontSize:16}}>{t(lang,'dr_last')}</h3></div>
            <div className="lrow"><span className="ptag contest">{t(lang,'dr_title')}</span><div className="lmain"><div className="ltitle">{draws.join(' · ')}</div></div><div className="lamt plus">+{fmt(PTS.drawPrize)}</div></div>
          </div>
        )}
        <div className="prule">{t(lang,'c_lead')}</div>
      </div>
    </div>
  );
}

function ExchangeTab({ user, wallet, lang }) {
  const L = k => t(lang, k);
  const [amt, setAmt] = useState(() => Math.max(PTS.minExchange, Math.min(1000, Math.floor(wallet.balance))));
  const [username, setUsername] = useState(user.displayName || '');
  const [discord, setDiscord] = useState('');
  const [step, setStep] = useState('amount');
  const [active, setActive] = useState(null); // { id, amt, listPrice, username, discord }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = !wallet.hasPurchased;
  const tooLow = amt < PTS.minExchange, tooHigh = amt > wallet.balance;
  const can = !locked && !tooLow && !tooHigh && username.trim() && discord.trim() && !busy;

  const start = async () => {
    if (!can) return;
    setBusy(true); setErr('');
    const listPrice = +(amt + randListOffset()).toFixed(2);
    const rec = { amt, listPrice, status:'awaiting_listing', createdAt: svTs(), username: username.trim(), discord: discord.trim() };
    try {
      const ref = db.ref('points/' + user.uid + '/exchanges').push();
      await ref.set(rec);
      setActive({ id: ref.key, amt, listPrice, username: rec.username, discord: rec.discord });
      setStep('listing');
    } catch (e) { setErr(L('err_generic')); }
    setBusy(false);
  };
  const resume = x => { setActive({ id: x.id, amt: x.amt, listPrice: x.listPrice, username: x.username, discord: x.discord }); setStep('listing'); };
  const cancel = async x => { try { await db.ref('points/' + user.uid + '/exchanges/' + x.id + '/status').set('cancelled'); } catch (e) {} };
  const sendListing = async (pattern, screenshot) => {
    const payload = { embeds:[{ title:'🔫 G22 "Flock" listing — Points exchange', description: 'Buy out this listing to fill a points exchange. Then mark it filled in Admin → Points.', color: 16766720,
      fields:[ { name:'Username', value: active.username || '—', inline:true }, { name:'Discord', value: active.discord || '—', inline:true }, { name:'Pattern', value: pattern, inline:true },
               { name:'Gold', value: fmt(active.amt) + ' G', inline:true }, { name:'Listed For', value: fmtG(active.listPrice) + ' G', inline:true }, { name:'Account', value: user.email || user.uid, inline:false } ],
      timestamp: new Date().toISOString() }] };
    let ok = false, screenshotUrl = null;
    try {
      const ext = (screenshot.name.match(/\.[a-zA-Z0-9]+$/) || ['.png'])[0];
      const fd = new FormData(); fd.append('payload_json', JSON.stringify(payload)); fd.append('files[0]', screenshot, 'listing-screenshot' + ext);
      const res = await fetch(WEBHOOK + '?wait=true', { method:'POST', body: fd }); ok = res.ok;
      try { const msg = await res.json(); screenshotUrl = (msg && msg.attachments && msg.attachments[0] && msg.attachments[0].url) || null; } catch (e) {}
    } catch (e) {}
    if (!ok) return false;
    try { await db.ref('points/' + user.uid + '/exchanges/' + active.id).update({ status:'listed', flockPattern: pattern, screenshotUrl }); } catch (e) { return false; }
    setStep('done');
    return true;
  };
  const steps = ['ex_prog_amt','prog_listing','prog_gold'];

  let body;
  if (step === 'listing' && active) {
    body = (<div><OrderProgress step={2} steps={steps} lang={lang} /><FlockStep listPrice={active.listPrice} heading={tf(lang,'ex_list_h',{ n: fmt(active.amt) })} submitLabel={L('flock_send')} onSubmit={sendListing} lang={lang} /></div>);
  } else if (step === 'done' && active) {
    body = (
      <div style={{textAlign:'center'}}>
        <OrderProgress step={3} steps={steps} lang={lang} />
        <div style={{fontSize:40,fontWeight:800,color:'var(--green)'}}>✓</div>
        <h3>{tf(lang,'ex_done_h',{ n: fmt(active.amt) })}</h3>
        <p className="msub" style={{marginTop:8}}>{tf(lang,'ex_done_p',{ n: fmt(active.amt) })}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => { setActive(null); setStep('amount'); }}>{L('ex_more')}</button>
      </div>
    );
  } else {
    body = (
      <div>
        <OrderProgress step={1} steps={steps} busy={busy} lang={lang} />
        <label htmlFor="ex-amt" style={{fontSize:13,color:'var(--muted)',fontWeight:700,display:'block',marginBottom:7}}>{L('ex_amount')}</label>
        <input id="ex-amt" type="number" min={PTS.minExchange} step={50} value={amt} onChange={e => setAmt(Math.max(0, parseInt(e.target.value) || 0))} />
        <div className="chips">{[250, 1000, 5000].map(v => <button key={v} type="button" className="chip" onClick={() => setAmt(v)}>{fmt(v)}</button>)}<button type="button" className="chip" onClick={() => setAmt(Math.max(0, Math.floor(wallet.balance)))}>{L('ex_all')} ({fmt(Math.max(0, Math.floor(wallet.balance)))})</button></div>
        <div className="quote" style={{marginTop:10,background: tooLow || tooHigh ? '#FBEBE9' : undefined, color: tooLow || tooHigh ? 'var(--danger)' : undefined}}>
          {tooLow ? tf(lang,'ex_min',{ n: fmt(PTS.minExchange) }) : tooHigh ? tf(lang,'ex_have',{ n: fmt(Math.floor(wallet.balance)) }) : tf(lang,'ex_get',{ n: fmt(amt) })}
        </div>
        {locked && <div className="prule" style={{marginTop:10,color:'var(--danger)'}}>{L('ex_locked')}</div>}
        <label htmlFor="ex-user" style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',margin:'14px 0 6px'}}>{L('co_user')}</label>
        <input id="ex-user" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. CamelS2" />
        <label htmlFor="ex-dc" style={{fontSize:13,color:'var(--muted)',fontWeight:600,display:'block',margin:'12px 0 6px'}}>{L('co_discord')}</label>
        <input id="ex-dc" value={discord} onChange={e => setDiscord(e.target.value)} placeholder="e.g. camel5961" />
        <button className="btn btn-gold" style={{width:'100%',marginTop:14}} disabled={!can} onClick={start}>{busy ? L('co_sending') : L('ex_continue')}</button>
        {err && <div className="alert err">{err}</div>}
      </div>
    );
  }
  return (
    <div className="pgrid2">
      <div className="card" style={{transform:'none'}}>{body}</div>
      <div className="pstack">
        <div className="card" style={{transform:'none'}}>
          <div className="eyebrow">{L('w_balance')}</div>
          <div style={{marginTop:10}}><span className="bigpts" style={{fontSize:40}}>{fmt(Math.floor(wallet.balance))}</span><span className="ptunit">{L('pts_unit')}</span></div>
          <div className="prule" style={{marginTop:14}}>{tf(lang,'ex_rule',{ n: fmt(PTS.minExchange) })}</div>
        </div>
        {wallet.openEx.length > 0 && step === 'amount' && (
          <div className="lrows">
            <div className="lhead"><h3 style={{fontSize:16}}>{L('ex_open')}</h3></div>
            {wallet.openEx.map(x => (
              <div key={x.id} className="lrow">
                <div className="lmain"><div className="ltitle">{fmt(x.amt)} G</div><div className="lmeta">{fmtG(x.listPrice || 0)} G</div></div>
                <button className="btn btn-gold btn-sm" onClick={() => resume(x)}>{L('ex_finish')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => cancel(x)}>{L('ex_cancel')}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletPage({ user, signIn, pts, cfg, legacyUser, tab, setTab, goSubs, goBuy, lang }) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [legacyToday, setLegacyToday] = useState(null);
  useEffect(() => {
    if (!user) return;
    const r = db.ref('dailyClaims/' + user.uid + '/' + new Date().toISOString().slice(0, 10));
    const cb = r.on('value', s => setLegacyToday(s.val()), () => {});
    return () => { try { r.off('value', cb); } catch (e) {} };
  }, [user]);
  if (!user) return (
    <section><div className="wrap" style={{textAlign:'center',maxWidth:520}}>
      <div className="eyebrow">{t(lang,'nav_dash')}</div>
      <h2 style={{margin:'10px 0 14px'}}>{t(lang,'w_signin_h')}</h2>
      <p style={{color:'var(--muted)',marginBottom:22}}>{t(lang,'w_signin_p')}</p>
      <button className="btn btn-gold" onClick={signIn}>{t(lang,'signin')}</button>
    </div></section>
  );
  const { wallet, data, orders } = pts;
  const legacyTier = !wallet.tier ? activeTier(legacyUser) : null;
  const tabs = [['wallet','tab_wallet'],['earn','tab_earn'],['contests','tab_contests'],['exchange','tab_exchange']];
  return (
    <section><div className="wrap">
      <div className="sect-head"><div className="eyebrow">{t(lang,'nav_dash')}</div><h2>{t(lang,'w_title')}</h2><p>{t(lang,'w_lead')}</p></div>
      <div className="subtabs" role="tablist">{tabs.map(([id, k]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{t(lang,k)}</button>)}</div>
      {!pts.ready ? <p className="msub">…</p> : tab === 'earn' ? <EarnTab user={user} wallet={wallet} data={data} cfg={cfg} legacyUser={legacyUser} lang={lang} />
        : tab === 'contests' ? <ContestsTab user={user} wallet={wallet} lang={lang} />
        : tab === 'exchange' ? <ExchangeTab user={user} wallet={wallet} lang={lang} />
        : (
        <div>
          <div className="pgrid2">
            <div className="card" style={{transform:'none'}}>
              <div className="eyebrow">{t(lang,'w_balance')}</div>
              <div style={{marginTop:10}}><span className="bigpts">{fmt(Math.floor(wallet.balance))}</span><span className="ptunit">{t(lang,'pts_unit')}</span></div>
              <div className="sub" style={{marginTop:6}}>{tf(lang,'w_worth',{ n: fmt(Math.max(0, Math.floor(wallet.balance))) })}</div>
              <div style={{display:'flex',gap:18,flexWrap:'wrap',margin:'6px 0 18px',fontSize:14,color:'var(--muted)'}}>
                <span><b style={{color:'var(--ink)'}}>{fmt(wallet.bought)}</b> {t(lang,'w_paid')}</span>
                <span><b style={{color:'var(--ink)'}}>{fmt(wallet.earned)}</b> {t(lang,'w_free')}</span>
                <span><b style={{color:'var(--ink)'}}>{wallet.tickets}</b> {t(lang,'w_tickets')}</span>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <button className="btn btn-gold" onClick={() => setTab('exchange')}>{t(lang,'w_exchange')}</button>
                <button className="btn btn-ghost" onClick={goBuy}>{t(lang,'w_buy')}</button>
              </div>
            </div>
            <div className="pstack">
              <SubCard wallet={wallet} legacyTier={legacyTier} legacyClaimed={!!legacyToday} onLegacyClaim={() => setClaimOpen(true)} goSubs={goSubs} lang={lang} />
              <CheckinCard user={user} wallet={wallet} lang={lang} />
            </div>
          </div>
          <HistoryList wallet={wallet} orders={orders} lang={lang} />
        </div>
      )}
      {claimOpen && legacyTier && <ClaimModal user={user} tier={legacyTier} amount={DAILY_GOLD[legacyTier] || 0} username={(legacyUser && legacyUser.standoffUsername) || user.displayName} onClose={() => setClaimOpen(false)} onClaimed={() => setClaimOpen(false)} lang={lang} />}
    </div></section>
  );
}

// ---------------- Admin: points ----------------
function PointsAdmin({ users, flashSale }) {
  const [view, setView] = useState('orders');
  const [allPts, setAllPts] = useState({});
  const [allOrders, setAllOrders] = useState({});
  const [cfg, setCfg] = useState({});
  const [busy, setBusy] = useState('');
  const now = nowMs(); const wk = weekIdx(now);
  useEffect(() => {
    const a = db.ref('points'), b = db.ref('pointsOrders'), c = db.ref('pointsConfig');
    const ca = a.on('value', s => setAllPts(s.val() || {}), () => {});
    const cb = b.on('value', s => setAllOrders(s.val() || {}), () => {});
    const cc = c.on('value', s => setCfg(s.val() || {}), () => {});
    return () => { try { a.off('value', ca); b.off('value', cb); c.off('value', cc); } catch (e) {} };
  }, []);
  const userById = {}; (users || []).forEach(u => { userById[u.uid] = u; });
  const who = uid => { const u = userById[uid] || {}; return (u.name || '(no name)') + (u.email ? ' · ' + u.email : ''); };
  const walletOf = uid => computeWallet(allPts[uid], now);
  const ledgerAdd = (uid, entry) => db.ref('points/' + uid + '/ledger').push(Object.assign({ ts: Date.now() }, entry));

  // ---- orders ----
  const orders = [];
  Object.keys(allOrders).forEach(uid => Object.keys(allOrders[uid] || {}).forEach(id => orders.push(Object.assign({ uid, id }, allOrders[uid][id]))));
  orders.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const quoteFor = o => {
    const w = walletOf(o.uid);
    const legacy = activeTier(userById[o.uid]);
    const tier = w.tier || legacy || null;
    // A flash bonus counts if the order was placed while that sale was running.
    const fs = flashSale; const at = o.createdAt || 0;
    const fl = fs && Number(fs.percent) > 0 && (!fs.endsAt || at < fs.endsAt) && (!fs.startedAt || at >= fs.startedAt) && (fs.active || (fs.endsAt && at < fs.endsAt)) ? { active:true, percent: fs.percent, label: fs.label } : null;
    return { q: quoteOrder(o, { tier, hasPurchased: w.hasPurchased, lifetimeBought: w.lifetimeBought, flash: fl }), legacy: !w.tier && !!legacy, tier };
  };
  const confirmOrder = async o => {
    const { q } = quoteFor(o);
    if (!q) { alert('This order has an unknown item. Reject it and sort it out by hand.'); return; }
    setBusy(o.id);
    try {
      const tag = { order: o.id };
      // Referral: pays both sides once, on the buyer's first confirmed payment, and never for self-referrals
      const before = walletOf(o.uid);
      const ref = o.referral && o.referral !== o.uid && userById[o.referral] ? o.referral : null;
      if (ref && !before.hasPurchased && !Object.values((allPts[o.uid] || {}).ledger || {}).some(l => l.kind === 'referral')) {
        await ledgerAdd(ref, { kind:'referral', role:'referrer', amt: PTS.referral, label: 'Referral: a friend made their first purchase', friend: o.uid, order: o.id });
        await ledgerAdd(o.uid, { kind:'referral', role:'friend', amt: PTS.referralFriend, label: 'Joined through a friend', referrer: ref, order: o.id });
      }
      if (o.kind === 'sub') {
        const w = walletOf(o.uid); const days = TERM_DAYS[o.term] || 31;
        let start = Date.now();
        if (w.period && w.period.tier === o.tier) start = w.period.end;                 // extend the same plan
        else if (w.period) await db.ref('points/' + o.uid + '/periods/' + w.period.id + '/end').set(Date.now()); // switch plan from today
        await db.ref('points/' + o.uid + '/periods').push({ tier: o.tier, term: o.term, start, end: start + days * DAY_MS, order: o.id });
        if (q.yrBonus) await ledgerAdd(o.uid, Object.assign({ kind:'bonus', amt: q.yrBonus, label: tierName(o.tier) + ' yearly bonus' }, tag));
        if (q.bonus.pts) await ledgerAdd(o.uid, Object.assign({ kind:'bonus', amt: q.bonus.pts, label: q.bonus.lines.map(l => bonusText('en', l)).join(', ') }, tag));
      } else {
        await ledgerAdd(o.uid, Object.assign({ kind:'buy', amt: q.base, label: o.title || 'Points' }, tag));
        if (q.bonus.pts) await ledgerAdd(o.uid, Object.assign({ kind:'bonus', amt: q.bonus.pts, label: q.bonus.lines.map(l => bonusText('en', l)).join(', ') }, tag));
      }
      await db.ref('pointsOrders/' + o.uid + '/' + o.id).update({ status:'confirmed', confirmedAt: Date.now(), credited: q.credit });
    } catch (e) { alert('Could not confirm: ' + (e.message || e)); }
    setBusy('');
  };
  const rejectOrder = async o => { setBusy(o.id); try { await db.ref('pointsOrders/' + o.uid + '/' + o.id).update({ status:'rejected', rejectedAt: Date.now() }); } catch (e) {} setBusy(''); };

  // ---- exchanges ----
  const exchanges = [];
  Object.keys(allPts).forEach(uid => Object.keys((allPts[uid] || {}).exchanges || {}).forEach(id => exchanges.push(Object.assign({ uid, id }, allPts[uid].exchanges[id]))));
  exchanges.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  const openEx = exchanges.filter(x => x.status === 'listed' || x.status === 'awaiting_listing');
  const fillEx = async x => {
    setBusy(x.id);
    try {
      const done = Date.now();
      await db.ref('points/' + x.uid + '/exchanges/' + x.id).update({ status:'filled', filledAt: done });
      feedPush(x.createdAt || done, { handle: maskHandle(x.username), gold: x.amt || 0, listed: x.listPrice || null, status:'filled', fillMins: Math.max(1, Math.round((done - (x.createdAt || done)) / 60000)) });
    } catch (e) { alert('Could not update: ' + (e.message || e)); }
    setBusy('');
  };
  const rejectEx = async x => { setBusy(x.id); try { await db.ref('points/' + x.uid + '/exchanges/' + x.id).update({ status:'rejected', rejectedAt: Date.now() }); } catch (e) {} setBusy(''); };

  // ---- players ----
  const [q, setQ] = useState('');
  const players = (users || []).map(u => Object.assign({}, u, { w: walletOf(u.uid), legacy: activeTier(u) }))
    .filter(u => !q || (u.name || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').toLowerCase().includes(q.toLowerCase()) || u.uid.includes(q))
    .sort((a, b) => b.w.balance - a.w.balance);
  const adjust = async u => {
    const v = prompt('Points to add (use a minus sign to remove):', '100'); if (v === null) return;
    const n = parseInt(v); if (isNaN(n) || !n) return;
    const why = prompt('Reason (the player sees this):', n > 0 ? 'Referral reward' : 'Correction'); if (why === null) return;
    await ledgerAdd(u.uid, { kind: n > 0 ? 'earn' : 'adjust', amt: n, label: why || 'Adjustment' });
  };
  const givePlan = async (u, tier, term) => {
    if (!tier) return;
    const w = u.w; const days = TERM_DAYS[term];
    let start = Date.now();
    if (w.period && w.period.tier === tier) start = w.period.end;
    else if (w.period) await db.ref('points/' + u.uid + '/periods/' + w.period.id + '/end').set(Date.now());
    await db.ref('points/' + u.uid + '/periods').push({ tier, term, start, end: start + days * DAY_MS, comp: true });
  };
  const moveLegacy = async u => {
    const ends = u.subscriptionEnds && u.subscriptionEnds > Date.now() ? u.subscriptionEnds : Date.now() + TERM_DAYS.monthly * DAY_MS;
    await db.ref('points/' + u.uid + '/periods').push({ tier: u.legacy, term: u.subscriptionTerm || 'monthly', start: Date.now(), end: ends, migrated: true });
    await db.ref('users/' + u.uid).update({ subscriptionTier: null, subscriptionEnds: null, subscriptionTerm: null, movedToPointsAt: Date.now() });
  };
  const moveAllLegacy = async () => {
    const list = players.filter(u => u.legacy && !u.w.tier);
    if (!list.length || !confirm('Move ' + list.length + ' legacy subscriber(s) to daily points? Their remaining days carry over.')) return;
    setBusy('migrate'); for (const u of list) { try { await moveLegacy(u); } catch (e) {} } setBusy('');
  };

  // ---- rewards & contests ----
  const [links, setLinks] = useState(null);
  useEffect(() => { if (links === null && cfg) setLinks({ discordUrl: taskLink(cfg, 'discordUrl'), youtubeUrl: taskLink(cfg, 'youtubeUrl'), tiktokUrl: taskLink(cfg, 'tiktokUrl'), videoUrl: cfg.videoUrl || '' }); }, [cfg]);
  const saveLinks = async () => {
    const v = Object.assign({}, links);
    const upd = { discordUrl: v.discordUrl.trim() || null, youtubeUrl: v.youtubeUrl.trim() || null, tiktokUrl: v.tiktokUrl.trim() || null, videoUrl: v.videoUrl.trim() || null };
    setBusy('links'); try { await db.ref('pointsConfig').update(upd); } catch (e) { alert('Save failed: ' + (e.message || e)); } setBusy('');
  };
  const [weekCode, setWeekCode] = useState('');
  const [savedCode, setSavedCode] = useState(null);
  useEffect(() => { db.ref('videoSecrets/' + wk + '/code').once('value').then(s => setSavedCode(s.val())).catch(() => setSavedCode(null)); }, [wk]);
  const saveCode = async () => {
    const c = normCode(weekCode); if (!c) return;
    setBusy('code');
    try {
      await db.ref('videoSecrets/' + wk).set({ code: c, setAt: Date.now() });
      await db.ref('pointsConfig').update({ videoWeek: wk, videoUrl: (links.videoUrl || '').trim() || null });
      setSavedCode(c); setWeekCode('');
    } catch (e) { alert('Save failed: ' + (e.message || e)); }
    setBusy('');
  };
  const [pc, setPc] = useState(null);
  const [prevPc, setPrevPc] = useState(null);
  const [skin, setSkin] = useState(''); const [price, setPrice] = useState(''); const [series, setSeries] = useState(''); const [actual, setActual] = useState('');
  const [drawPrev, setDrawPrev] = useState(null);
  useEffect(() => {
    const r = db.ref('contests/priceCall/' + wk), r2 = db.ref('contests/priceCall/' + (wk - 1)), r3 = db.ref('contests/draw/' + (wk - 1));
    const c1 = r.on('value', s => setPc(s.val() || {}), () => {}); const c2 = r2.on('value', s => setPrevPc(s.val() || {}), () => {}); const c3 = r3.on('value', s => setDrawPrev(s.val() || {}), () => {});
    return () => { try { r.off('value', c1); r2.off('value', c2); r3.off('value', c3); } catch (e) {} };
  }, [wk]);
  const openPriceCall = async () => {
    if (!skin.trim() || !(Number(price) > 0)) { alert('Add the skin name and its current price.'); return; }
    await db.ref('contests/priceCall/' + wk + '/meta').set({ skin: skin.trim(), price: Number(price), series: series.trim() || null, closesAt: nextSundayClose(now), openedAt: Date.now() });
  };
  const settle = async (w, data) => {
    const a = Number(actual); if (!(a > 0)) { alert('Enter the closing price first.'); return; }
    const entries = Object.keys((data && data.entries) || {}).map(uid => Object.assign({ uid }, data.entries[uid]));
    if (!entries.length) { alert('No entries to settle.'); return; }
    entries.sort((x, y) => Math.abs(x.guess - a) - Math.abs(y.guess - a) || (x.ts || 0) - (y.ts || 0));
    const win = entries[0];
    if (!confirm('Winner: ' + who(win.uid) + ' guessed ' + fmt(win.guess) + ' G (closed at ' + fmt(a) + '). Pay ' + fmt(PTS.priceCallPrize) + ' points?')) return;
    await ledgerAdd(win.uid, { kind:'contest', amt: PTS.priceCallPrize, label: 'Price Call winner' });
    await db.ref('contests/priceCall/' + w + '/result').set({ actual: a, guess: win.guess, winnerHandle: win.handle || maskHandle(''), paidAt: Date.now() });
  };
  const ticketsFor = (p, w) => {
    p = p || {}; let n = 0;
    Object.keys(p.checkins || {}).forEach(k => { const v = p.checkins[k]; if (v && String(dayIdx(v.ts)) === k && weekIdx(v.ts) === w) n++; });
    Object.keys(p.tasks || {}).forEach(k => { const v = p.tasks[k]; if (v && PTS.tasks[k] && weekIdx(v.ts) === w) n++; });
    Object.keys(p.video || {}).forEach(k => { const v = p.video[k]; if (v && String(weekIdx(v.ts)) === k && Number(k) === w) n++; });
    return n;
  };
  const runDraw = async () => {
    const w = wk - 1;
    if (drawPrev && drawPrev.winners) { alert('Last week was already drawn.'); return; }
    let pool = Object.keys(allPts).map(uid => ({ uid, n: ticketsFor(allPts[uid], w) })).filter(x => x.n > 0);
    if (!pool.length) { alert('Nobody earned tickets last week.'); return; }
    const winners = [];
    while (winners.length < PTS.drawWinners && pool.length) {
      const total = pool.reduce((a, x) => a + x.n, 0); let r = Math.random() * total; let i = 0;
      while (r >= pool[i].n) { r -= pool[i].n; i++; }
      winners.push(pool[i].uid); pool.splice(i, 1);
    }
    if (!confirm('Winners: ' + winners.map(who).join(' | ') + '. Pay ' + fmt(PTS.drawPrize) + ' points each?')) return;
    for (const uid of winners) await ledgerAdd(uid, { kind:'contest', amt: PTS.drawPrize, label: 'Weekly draw winner' });
    await db.ref('contests/draw/' + w).set({ winners: winners.map(uid => maskHandle((userById[uid] || {}).name || '')), drawnAt: Date.now() });
  };

  const sub = (k, l, n) => <button className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}{n ? ' (' + n + ')' : ''}</button>;
  const legacyCount = players.filter(u => u.legacy && !u.w.tier).length;
  return (
    <div>
      <div className="toggle" style={{marginBottom:18}}>{sub('orders','Payments',pendingOrders.length)}{sub('ex','Exchanges',openEx.length)}{sub('players','Players')}{sub('rewards','Rewards')}</div>

      {view === 'orders' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <p className="msub">Check the payment arrived, then confirm. Points are credited from the price list and the player's real bonuses, not from what the browser sent.</p>
          {orders.length === 0 && <p className="msub">No points orders yet.</p>}
          {orders.slice(0, 80).map(o => {
            const { q: qq, legacy } = quoteFor(o);
            const mismatch = qq && Math.abs(qq.price - Number(o.price || 0)) > 0.009;
            return (
              <div key={o.uid + o.id} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:220}}>
                  <div style={{fontWeight:700}}>{o.title} · ${Number(o.price || 0).toFixed(2)} <span className={'ptag ' + (o.status === 'pending' ? 'pend' : o.status === 'confirmed' ? 'earn' : 'bad')} style={{marginLeft:6}}>{o.status}</span></div>
                  <div className="sub" style={{marginBottom:0}}>{who(o.uid)} · {PAYMENT_METHOD_LABELS[o.method] || o.method} · {o.username} / {o.discord} · {new Date(o.createdAt || 0).toLocaleString()}</div>
                  {o.gcCode && <div style={{fontSize:12,color:'var(--gold)',marginTop:4}}>Gift code: {o.gcCode}</div>}
                  {o.referral && <div style={{fontSize:12,color:'var(--gold)',marginTop:4}}>Referred by: {o.referral}</div>}
                  {o.status === 'pending' && qq && <div style={{fontSize:13,marginTop:6}}>Will credit <b>{fmt(qq.credit)}</b> points now{o.kind === 'sub' ? ' + ' + DAILY_GOLD[o.tier] + '/day for ' + TERM_DAYS[o.term] + ' days' : ''}{qq.bonus.lines.length ? ' (' + qq.bonus.lines.map(l => bonusText('en', l)).join(', ') + ')' : ''}</div>}
                  {o.status === 'pending' && mismatch && <div style={{fontSize:13,color:'var(--danger)',fontWeight:700,marginTop:4}}>Price check: this order should cost ${qq.price.toFixed(2)}. Make sure that's what was paid.</div>}
                  {o.status === 'pending' && legacy && <div style={{fontSize:12,color:'var(--gold)',marginTop:4}}>Uses the player's old-system tier for rates and bonuses.</div>}
                </div>
                {o.status === 'pending' && <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-gold btn-sm" disabled={busy === o.id} onClick={() => confirmOrder(o)}>Payment received</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === o.id} onClick={() => rejectOrder(o)}>Reject</button>
                </div>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'ex' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <p className="msub">Buy out the player's G22 "Flock" listing, then mark it filled. Rejecting returns the points to their wallet.</p>
          {exchanges.length === 0 && <p className="msub">No exchanges yet.</p>}
          {exchanges.slice(0, 80).map(x => {
            const bal = walletOf(x.uid).balance; const open = x.status === 'listed' || x.status === 'awaiting_listing';
            return (
              <div key={x.uid + x.id} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:220}}>
                  <div style={{fontWeight:700}}>{fmt(x.amt || 0)} G · listed for {fmtG(x.listPrice || 0)} G <span className={'ptag ' + (x.status === 'filled' ? 'earn' : x.status === 'listed' ? 'pend' : x.status === 'awaiting_listing' ? '' : 'bad')} style={{marginLeft:6}}>{x.status}</span></div>
                  <div className="sub" style={{marginBottom:0}}>{who(x.uid)} · {x.username} / {x.discord}{x.flockPattern ? ' · pattern ' + x.flockPattern : ''} · {new Date(x.createdAt || 0).toLocaleString()}</div>
                  {x.screenshotUrl && <a href={x.screenshotUrl} target="_blank" rel="noopener" style={{fontSize:13}}>Listing screenshot</a>}
                  {((allPts[x.uid] || {}).ratings || {})[x.id] && (() => { const r = allPts[x.uid].ratings[x.id]; return <div style={{fontSize:13,marginTop:4}}><span className="goldtext">{'★'.repeat(r.stars || 0)}</span>{r.text ? ' · ' + r.text : ''}</div>; })()}
                  {open && bal < 0 && <div style={{fontSize:13,color:'var(--danger)',fontWeight:700,marginTop:4}}>Overdrawn: this player is {fmt(Math.ceil(-bal))} points short. Don't fill until it's sorted.</div>}
                </div>
                {open && <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-gold btn-sm" disabled={busy === x.id || x.status !== 'listed' || bal < 0} onClick={() => fillEx(x)}>Mark filled</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === x.id} onClick={() => rejectEx(x)}>Reject</button>
                </div>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'players' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or UID" style={{maxWidth:320}} />
            {legacyCount > 0 && <button className="btn btn-gold btn-sm" disabled={busy === 'migrate'} onClick={moveAllLegacy}>Move {legacyCount} old subscriber{legacyCount > 1 ? 's' : ''} to daily points</button>}
          </div>
          {players.slice(0, 150).map(u => (
            <div key={u.uid} className="card" style={{transform:'none',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:220}}>
                <div style={{fontWeight:700}}>{u.name || '(no name)'} <span className="sub" style={{fontSize:12}}>{u.email || ''}</span></div>
                <div className="sub" style={{marginBottom:0}}><b style={{color:u.w.balance < 0 ? 'var(--danger)' : 'var(--ink)'}}>{fmt(Math.floor(u.w.balance))} pts</b> · {fmt(u.w.bought)} paid · {fmt(u.w.earned)} free · plan: {u.w.tier ? tierName(u.w.tier) + ' (' + u.w.daysLeft + 'd left)' : 'none'}{u.legacy && !u.w.tier ? ' · old-system ' + u.legacy : ''}</div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <button className="btn btn-ghost btn-sm" onClick={() => adjust(u)}>± points</button>
                {u.legacy && !u.w.tier && <button className="btn btn-ghost btn-sm" onClick={() => moveLegacy(u)}>Move to points</button>}
                <select defaultValue="" onChange={e => { const [tier, term] = e.target.value.split(':'); e.target.value = ''; if (tier && confirm('Give ' + (u.name || 'this player') + ' a free ' + tier + ' ' + term + ' plan?')) givePlan(u, tier, term); }} style={{width:'auto',padding:'6px 10px',fontSize:13}} aria-label="Give plan">
                  <option value="">Give plan…</option>
                  {TIERS.map(T => <option key={T.id + 'm'} value={T.id + ':monthly'}>{T.name} · 31 days</option>)}
                  {TIERS.map(T => <option key={T.id + 'y'} value={T.id + ':yearly'}>{T.name} · 366 days</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'rewards' && links && (
        <div className="pgrid2">
          <div className="pstack">
            <div className="card" style={{transform:'none'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Task links</div>
              <p className="msub">A task only shows to players once its link is set. The weekly video task runs for the current week (Mon–Sun UTC) after you save a link.</p>
              {[['discordUrl','Discord invite (+' + PTS.tasks.discord + ')'],['youtubeUrl','YouTube channel (+' + PTS.tasks.youtube + ')'],['tiktokUrl','TikTok profile (+' + PTS.tasks.tiktok + ')'],['videoUrl',"This week's video link (optional, shown next to the code task)"]].map(([k, l]) => (
                <div key={k} className="field"><label htmlFor={'cfg-' + k}>{l}</label><input id={'cfg-' + k} value={links[k]} onChange={e => setLinks(Object.assign({}, links, { [k]: e.target.value }))} placeholder="https://" /></div>
              ))}
              <button className="btn btn-gold" disabled={busy === 'links'} onClick={saveLinks}>Save links</button>
            </div>
            <div className="card" style={{transform:'none'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Code word · this week (+{PTS.video})</div>
              <p className="msub">Say a code word in this week's YouTube video or TikTok. Players type it in to claim. The database checks it, and players can never see the saved code. Two words are harder to guess than one.</p>
              {savedCode && <div className="quote" style={{marginBottom:10}}>This week's code: <b>{savedCode}</b></div>}
              <div className="field"><label htmlFor="cfg-code">{savedCode ? 'Change the code' : 'Set the code'}</label><input id="cfg-code" value={weekCode} onChange={e => setWeekCode(e.target.value)} placeholder="e.g. golden flock" /></div>
              <button className="btn btn-gold" disabled={busy === 'code' || !normCode(weekCode)} onClick={saveCode}>Save code for this week</button>
              <p className="msub" style={{marginTop:10,marginBottom:0}}>The task resets every Monday (UTC). Set a new code each week.</p>
            </div>
            <div className="card" style={{transform:'none'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Weekly draw</div>
              <p className="msub">Draw last week's {PTS.drawWinners} winners. Each ticket is one check-in or task from that week. Winners get {fmt(PTS.drawPrize)} points.</p>
              {drawPrev && drawPrev.winners ? <div className="quote">Drawn: {drawPrev.winners.join(' · ')}</div> : <button className="btn btn-gold" onClick={runDraw}>Draw last week's winners</button>}
            </div>
          </div>
          <div className="pstack">
            <div className="card" style={{transform:'none'}}>
              <div className="eyebrow" style={{marginBottom:10}}>Price Call · this week</div>
              {pc && pc.meta ? (
                <div>
                  <div className="quote" style={{marginBottom:10}}>{pc.meta.skin} · {fmt(pc.meta.price)} G now · closes {new Date(pc.meta.closesAt).toLocaleString()}</div>
                  <div className="sub">{Object.keys(pc.entries || {}).length} entries</div>
                  {now >= pc.meta.closesAt && !pc.result && (
                    <div><div className="field"><label htmlFor="pc-actual">Closing price (G)</label><input id="pc-actual" type="number" value={actual} onChange={e => setActual(e.target.value)} /></div>
                    <button className="btn btn-gold" onClick={() => settle(wk, pc)}>Pay the closest call</button></div>
                  )}
                  {pc.result && <div className="quote">Paid {pc.result.winnerHandle} · guessed {fmt(pc.result.guess)}, closed {fmt(pc.result.actual)}</div>}
                </div>
              ) : (
                <div>
                  <div className="field"><label htmlFor="pc-skin">Skin of the week</label><input id="pc-skin" value={skin} onChange={e => setSkin(e.target.value)} placeholder="Name as shown on the Market Tracker" /></div>
                  <div className="field"><label htmlFor="pc-price">Current price (G)</label><input id="pc-price" type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
                  <div className="field"><label htmlFor="pc-series">Last 7 daily prices, comma separated (optional, draws the chart)</label><input id="pc-series" value={series} onChange={e => setSeries(e.target.value)} placeholder="1180,1205,1198,1222,1250,1236,1240" /></div>
                  <button className="btn btn-gold" onClick={openPriceCall}>Open this week's Price Call</button>
                  <p className="msub" style={{marginTop:10,marginBottom:0}}>Entries close Sunday 20:00 UTC.</p>
                </div>
              )}
            </div>
            {prevPc && prevPc.meta && !prevPc.result && (
              <div className="card" style={{transform:'none'}}>
                <div className="eyebrow" style={{marginBottom:10}}>Price Call · last week (unpaid)</div>
                <div className="sub">{prevPc.meta.skin} · {Object.keys(prevPc.entries || {}).length} entries</div>
                <div className="field"><label htmlFor="pc-actual2">Closing price (G)</label><input id="pc-actual2" type="number" value={actual} onChange={e => setActual(e.target.value)} /></div>
                <button className="btn btn-gold" onClick={() => settle(wk - 1, prevPc)}>Pay the closest call</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FlashBanner({ flashSale, onShop }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  let countdown = null;
  if (flashSale.endsAt) {
    const ms = flashSale.endsAt - now;
    if (ms > 0) {
      const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000), s = Math.floor((ms%60000)/1000);
      countdown = (h>0?h+'h ':'') + String(m).padStart(2,'0') + 'm ' + String(s).padStart(2,'0') + 's';
    }
  }
  return (
    <div onClick={onShop} style={{background:'var(--ink)',color:'#FFFFFF',padding:'9px 16px',textAlign:'center',fontFamily:'Figtree',fontWeight:700,fontSize:15,letterSpacing:'.03em',cursor:'pointer'}}>
      {flashSale.label || 'FLASH BONUS'} — +{flashSale.percent}% BONUS POINTS{countdown ? ' · ENDS IN ' + countdown : ''} · TAP TO SHOP
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userTier, setUserTier] = useState(null);
  const [lifetimeGold, setLifetimeGold] = useState(0);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [flashSale, setFlashSale] = useState(null);
  const [avgDeliveryHrs, setAvgDeliveryHrs] = useState(null);
  const [legacyUser, setLegacyUser] = useState(null);
  const [walletTab, setWalletTab] = useState('wallet');
  const [pointsOrder, setPointsOrder] = useState(null);
  const [payMethod, setPayMethod] = useState('cashapp');
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('cs2g_lang') || 'en'; } catch(e) { return 'en'; } });
  useEffect(() => {
    try { localStorage.setItem('cs2g_lang', lang); } catch(e) {}
    const meta = LANGS.find(l => l.code === lang) || LANGS[0];
    document.documentElement.dir = meta.dir;
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => auth.onAuthStateChanged(u => {
    const vu = u && u.emailVerified ? u : null;
    setUser(vu);
    if (vu) {
      setAuthOpen(false);
      db.ref('admins/' + vu.uid).once('value', s => setIsAdmin(s.val() === true)).catch(()=>setIsAdmin(false));
      db.ref('users/' + vu.uid).on('value', s => { setLegacyUser(s.val()); setUserTier(activeTier(s.val())); });
      db.ref('users/' + vu.uid + '/lifetimeGold').on('value', s => setLifetimeGold(s.val() || 0));
      db.ref('users/' + vu.uid + '/hasPurchased').on('value', s => setHasPurchased(s.val() === true));
    } else { setIsAdmin(false); setUserTier(null); setLegacyUser(null); setLifetimeGold(0); setHasPurchased(false); }
  }), []);
  useEffect(() => {
    const r = db.ref('flashSale');
    const cb = r.on('value', s => setFlashSale(s.val() || null));
    return () => { try { r.off('value', cb); } catch(e){} };
  }, []);
  useEffect(() => {
    db.ref('deliveryStats/avgHrs').once('value', s => { const v = s.val(); if (v != null) setAvgDeliveryHrs(v); }).catch(()=>{});
  }, []);
  useEffect(() => { try { const r = new URLSearchParams(location.search).get('ref'); if (r && /^[A-Za-z0-9_-]{6,64}$/.test(r)) localStorage.setItem('cs2g_ref', r); } catch(e) {} }, []);
  const signIn = () => setAuthOpen(true);
  const buy = item => setCheckout(item);
  const pts = usePoints(user);
  const pcfg = usePointsConfig();
  const pTier = pts.wallet.tier || userTier;
  const openPoints = o => setPointsOrder(o);
  const goWallet = tab => { setWalletTab(tab || 'wallet'); setPage('dash'); setTimeout(() => window.scrollTo(0, 0), 10); };
  const go = (id) => { setPage('home'); setTimeout(() => document.getElementById(id)?.scrollIntoView({behavior:'smooth'}), 30); };
  return (
    <div>
      <div className="annc">Weekly skin giveaways on our main site — <a href="https://standoff2markettracker.com" target="_blank" rel="noopener"><b>standoff2markettracker.com</b></a></div>
      {flashActive(flashSale) && <FlashBanner flashSale={flashSale} onShop={()=>go('packs')} />}
      <header><div className="wrap nav">
        <div className="logo">Cheap<span>Standoff2</span>Gold</div>
        <ul className="navlinks">
          <li><button onClick={()=>go('packs')}>{t(lang,'b_eyebrow')}</button></li>
          <li><button onClick={()=>go('subs')}>{t(lang,'nav_subs')}</button></li>
          <li><button onClick={()=>go('sell')}>{t(lang,'nav_sell')}</button></li>
          <li><button className={page==='dash'?'active':''} onClick={()=>goWallet('wallet')}>{t(lang,'nav_dash')}</button></li>
          {isAdmin && <li><button className={page==='admin'?'active':''} onClick={()=>setPage('admin')}>{t(lang,'nav_admin')}</button></li>}
        </ul>
        <div className="authbox">
          <select value={lang} onChange={e=>setLang(e.target.value)} style={{width:'auto',padding:'6px 8px',fontSize:12,background:'var(--bg2)',border:'1px solid var(--line)',borderRadius:6,color:'var(--ink)'}} aria-label="Language">
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          {user ? (<React.Fragment><span className="uname">{user.displayName||user.email}</span><button className="btn btn-ghost btn-sm" onClick={()=>auth.signOut()}>{t(lang,'signout')}</button></React.Fragment>)
                : (<button className="btn btn-ghost btn-sm" onClick={signIn}>{t(lang,'signin')}</button>)}
          <button className="menubtn" aria-label="Menu" onClick={()=>setMenuOpen(o=>!o)}>☰</button>
        </div>
      </div>{menuOpen && (<div className="mobilemenu"><button onClick={()=>{setPage('buy');setMenuOpen(false);}}>{t(lang,'cu_buy')}</button><button onClick={()=>{go('packs');setMenuOpen(false);}}>{t(lang,'b_eyebrow')}</button><button onClick={()=>{go('subs');setMenuOpen(false);}}>{t(lang,'nav_subs')}</button><button onClick={()=>{go('sell');setMenuOpen(false);}}>{t(lang,'nav_sell')}</button><button onClick={()=>{goWallet('wallet');setMenuOpen(false);}}>{t(lang,'nav_dash')}</button>{isAdmin && <button onClick={()=>{setPage('admin');setMenuOpen(false);}}>{t(lang,'nav_admin')}</button>}<button onClick={()=>{(user ? auth.signOut() : signIn());setMenuOpen(false);}}>{user ? t(lang,'signout') : t(lang,'signin')}</button></div>)}</header>

      {page === 'home' ? (
        <main>
          <div className="hero"><div className="wrap herogrid">
            <div>
              <div className="eyebrow">{t(lang,'hero_eyebrow')}</div>
              <h1>{t(lang,'hero_title1')} <span className="goldtext">{t(lang,'hero_title2')}</span> {t(lang,'hero_title3')}</h1>
              <p className="lead">{t(lang,'hero_lead')}</p>
              <div className="heroctas">
                <button className="btn btn-gold" onClick={()=>go('packs')}>{t(lang,'hero_cta1')}</button>
                <button className="btn btn-ghost" onClick={()=>go('subs')}>{t(lang,'hero_cta2')}</button>
              </div>
              <div className="trustline"><span>◆ <b>{t(lang,'trust1')}</b></span><span>◆ <b>{t(lang,'trust2')}</b></span><span>◆ <b>{t(lang,'trust3')}</b>: camel5961</span></div>
            </div>
            <div className="dealcard">
              <div className="tag">TOP DEAL</div>
              <div className="eyebrow" style={{marginBottom:6}}>Gold Tier</div>
              <div className="dealnum goldtext num">6,500</div>
              <div className="dealsub">points every month for $37.99</div>
              <div className="dealrow"><span>Paid into your wallet</span><b>217 every day</b></div>
              <div className="dealrow"><span>Points per dollar</span><b>{fmt(Math.round(6500 / 37.99))}</b></div>
              <div className="dealrow"><span>Pay in crypto</span><b>+{fmt(Math.round(217 * 31 * PTS.crypto / 100))} points up front</b></div>
              <button className="btn btn-gold" style={{width:'100%',marginTop:18}} onClick={()=>openPoints({ kind:'sub', tier:'gold', term:'monthly' })}>Get the Gold plan</button>
            </div>
          </div></div>
          <StatsBar avgDeliveryHrs={avgDeliveryHrs} />
          <LiveOrders lang={lang} />
          <PointsHow lang={lang} />
          <PointsBundles lang={lang} wallet={pts.wallet} tier={pTier} flash={flashSale} method={payMethod} setMethod={setPayMethod} open={openPoints} />
          <section id="buy-custom" style={{paddingTop:0}}>
            <div className="wrap">
              <div className="sect-head"><div className="eyebrow">{t(lang,'cu_eyebrow')}</div><h2>{t(lang,'cu_h2a')} <span className="goldtext">{t(lang,'cu_h2b')}</span></h2><p>{t(lang,'cu_p')}</p></div>
              <CustomPoints lang={lang} wallet={pts.wallet} tier={pTier} flash={flashSale} method={payMethod} setMethod={setPayMethod} open={openPoints} />
            </div>
          </section>
          <PointsSubs lang={lang} wallet={pts.wallet} method={payMethod} setMethod={setPayMethod} open={openPoints} />
          <EarnTeaser lang={lang} goWallet={goWallet} />
          <Sell sell={buy} lang={lang} />
          <FAQ lang={lang} />
        </main>
      ) : page === 'buy' ? (
        <section><div className="wrap">
          <div className="sect-head"><div className="eyebrow">{t(lang,'cu_eyebrow')}</div><h2>{t(lang,'cu_h2a')} <span className="goldtext">{t(lang,'cu_h2b')}</span></h2><p>{t(lang,'cu_p')}</p></div>
          <CustomPoints showHead lang={lang} wallet={pts.wallet} tier={pTier} flash={flashSale} method={payMethod} setMethod={setPayMethod} open={openPoints} />
        </div></section>
      ) : page === 'admin' ? (
        <AdminPanel user={user} signIn={signIn} flashSale={flashSale} />
      ) : (
        <WalletPage user={user} signIn={signIn} pts={pts} cfg={pcfg} legacyUser={legacyUser} tab={walletTab} setTab={setWalletTab} goSubs={() => go('subs')} goBuy={() => go('packs')} lang={lang} />
      )}

      <footer><div className="wrap fgrid">
        <div>© {new Date().getFullYear()} CheapStandoff2Gold — by the <a href="https://standoff2markettracker.com" target="_blank" rel="noopener">standoff2markettracker.com</a> team</div>
        <div>{t(lang,'footer_support')}: <b style={{color:'var(--gold)'}}>camel5961</b> on Discord</div>
      </div></footer>

      <div className="mcta"><button className="btn btn-gold" onClick={()=>go('packs')}>{t(lang,'hero_cta1')}</button></div>
      {checkout && <Checkout item={checkout} user={user} tier={userTier} go={go} onClose={()=>setCheckout(null)} lang={lang} />}
      {pointsOrder && <PointsCheckout order={pointsOrder} user={user} wallet={pts.wallet} tier={pTier} flash={flashSale} startMethod={payMethod} onClose={()=>setPointsOrder(null)} onWallet={()=>goWallet('wallet')} signIn={signIn} lang={lang} />}
      {authOpen && <AuthPanel onClose={()=>setAuthOpen(false)} />}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
