/* ============================================================
   Use-By Hub — Application Logic with Firebase Cloud Sync
   Son Kullanma Tarihi Takip Uygulaması
   ============================================================ */

// ==================== FIREBASE IMPORTS ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
    apiKey: "AIzaSyDnQuBy0hXmovPYdb_2iqdYG6j97tDiTF8",
    authDomain: "use-by-hub.firebaseapp.com",
    projectId: "use-by-hub",
    storageBucket: "use-by-hub.firebasestorage.app",
    messagingSenderId: "732101682280",
    appId: "1:732101682280:web:a4f73a5d234fc7cd1a07dd",
    measurementId: "G-V2RJ8994D9"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ==================== CONSTANTS ====================
const CATEGORY_EMOJI = {
    'Gıda': '🍎',
    'İlaç': '💊',
    'Kozmetik': '💄',
    'Diğer': '📦'
};

const TOAST_ICONS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
};

// ==================== STATE ====================
let html5QrCode = null;
let scannerRunning = false;
let unsubscribeProducts = null;
let currentProducts = [];

// ==================== AUTHENTICATION ====================
async function signInWithGoogle() {
    var btn = document.getElementById('google-signin-btn');
    var errorEl = document.getElementById('login-error');
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner-sm"></div> Giriş yapılıyor...';
    errorEl.classList.add('hidden');

    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error('Sign-in error:', error);
        btn.disabled = false;
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Google ile Giriş Yap';

        var msg = 'Giriş yapılırken hata oluştu.';
        if (error.code === 'auth/popup-closed-by-user') {
            msg = 'Giriş penceresi kapatıldı.';
        } else if (error.code === 'auth/unauthorized-domain') {
            msg = 'Bu domain yetkili değil. Firebase Console\'dan domain ekleyin.';
        }
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
        showToast(msg, 'error');
    }
}

async function handleSignOut() {
    stopListeningToProducts();
    try {
        await firebaseSignOut(auth);
        showToast('Çıkış yapıldı.', 'info');
    } catch (error) {
        console.error('Sign-out error:', error);
        showToast('Çıkış yapılırken hata oluştu.', 'error');
    }
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').style.opacity = '1';
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('user-profile').classList.add('hidden');

    // Hide main app content
    document.getElementById('fab-add').style.display = 'none';
    var main = document.querySelector('main');
    if (main) main.style.display = 'none';
}

function showApp(user) {
    // Hide login & loading
    var loginScreen = document.getElementById('login-screen');
    loginScreen.style.opacity = '0';
    setTimeout(function () {
        loginScreen.classList.add('hidden');
    }, 500);
    document.getElementById('loading-screen').classList.add('hidden');

    // Show main app
    document.getElementById('fab-add').style.display = 'flex';
    var main = document.querySelector('main');
    if (main) main.style.display = 'block';

    // Show user profile
    var profileEl = document.getElementById('user-profile');
    profileEl.classList.remove('hidden');
    profileEl.style.display = 'flex';

    var avatarEl = document.getElementById('user-avatar');
    if (user.photoURL) {
        avatarEl.src = user.photoURL;
        avatarEl.style.display = 'block';
    } else {
        avatarEl.style.display = 'none';
    }
}

// Auth state observer
onAuthStateChanged(auth, function (user) {
    if (user) {
        showApp(user);
        startListeningToProducts();
    } else {
        showLoginScreen();
        currentProducts = [];
        renderProducts([]);
    }
});

// ==================== FIRESTORE DATA LAYER ====================
function getProductsRef() {
    var user = auth.currentUser;
    if (!user) return null;
    return collection(db, 'users', user.uid, 'products');
}

async function addProduct(name, category, expiryDate) {
    var ref = getProductsRef();
    if (!ref) {
        showToast('Oturum bulunamadı.', 'error');
        return;
    }
    try {
        await addDoc(ref, {
            name: name.trim(),
            category: category,
            expiryDate: expiryDate,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Firestore add error:', error);
        showToast('Ürün eklenirken hata oluştu.', 'error');
    }
}

async function removeProduct(id) {
    var user = auth.currentUser;
    if (!user) return null;
    try {
        var productRef = doc(db, 'users', user.uid, 'products', id);
        // Find product name before deleting
        var product = currentProducts.find(function (p) { return p.id === id; });
        await deleteDoc(productRef);
        return product || null;
    } catch (error) {
        console.error('Firestore delete error:', error);
        showToast('Ürün silinirken hata oluştu.', 'error');
        return null;
    }
}

function startListeningToProducts() {
    // Stop any existing listener
    stopListeningToProducts();

    var ref = getProductsRef();
    if (!ref) return;

    var q = query(ref, orderBy('expiryDate', 'asc'));

    unsubscribeProducts = onSnapshot(q, function (snapshot) {
        currentProducts = [];
        snapshot.forEach(function (d) {
            currentProducts.push({ id: d.id, ...d.data() });
        });
        renderProducts(currentProducts);
    }, function (error) {
        console.error('Firestore listen error:', error);
        showToast('Veri yüklenirken hata oluştu. Firestore kurallarını kontrol edin.', 'error');
    });
}

function stopListeningToProducts() {
    if (unsubscribeProducts) {
        unsubscribeProducts();
        unsubscribeProducts = null;
    }
}

// ==================== DATE UTILITIES ====================
function getDaysRemaining(expiryDate) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var expiry = new Date(expiryDate + 'T00:00:00');
    expiry.setHours(0, 0, 0, 0);
    var diffMs = expiry.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
    try {
        var date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

function getStatusInfo(days) {
    if (days < 0) {
        return { cssClass: 'status-expired', label: 'Süresi Geçti', icon: '⛔', priority: 0 };
    } else if (days === 0) {
        return { cssClass: 'status-today', label: 'Bugün Son Gün!', icon: '🔴', priority: 1 };
    } else if (days <= 3) {
        return { cssClass: 'status-warning', label: 'Dikkat: ' + days + ' Gün Kaldı', icon: '🟠', priority: 2 };
    } else if (days <= 7) {
        return { cssClass: 'status-soon', label: days + ' Gün Kaldı', icon: '🟡', priority: 3 };
    } else {
        return { cssClass: 'status-safe', label: days + ' Gün Kaldı', icon: '🟢', priority: 4 };
    }
}

// ==================== RENDERING ====================
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderProducts(products) {
    var grid = document.getElementById('product-grid');
    var emptyState = document.getElementById('empty-state');
    var statsBar = document.getElementById('stats-bar');
    var badge = document.getElementById('notification-badge');
    var bellBtn = document.getElementById('notification-bell');

    if (!grid || !emptyState) return;

    // Compute stats
    var alertCount = 0;
    var warningCount = 0;
    var expiredCount = 0;

    products.forEach(function (p) {
        var days = getDaysRemaining(p.expiryDate);
        if (days < 0) {
            expiredCount++;
            alertCount++;
        } else if (days <= 3) {
            warningCount++;
            alertCount++;
        }
    });

    // Update notification badge
    if (alertCount > 0) {
        badge.textContent = alertCount > 99 ? '99+' : alertCount;
        badge.classList.remove('hidden');
        badge.classList.add('badge-pulse');
        bellBtn.classList.add('bell-shake');
        setTimeout(function () { bellBtn.classList.remove('bell-shake'); }, 900);
    } else {
        badge.classList.add('hidden');
        badge.classList.remove('badge-pulse');
    }

    // Update stats bar
    if (products.length > 0) {
        statsBar.classList.remove('hidden');
        document.getElementById('stat-total').textContent = products.length;
        document.getElementById('stat-warning').textContent = warningCount;
        document.getElementById('stat-expired').textContent = expiredCount;
    } else {
        statsBar.classList.add('hidden');
    }

    // Empty state
    if (products.length === 0) {
        grid.innerHTML = '';
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    grid.classList.remove('hidden');

    // Build cards HTML
    var cardsHtml = '';
    products.forEach(function (product, index) {
        var days = getDaysRemaining(product.expiryDate);
        var status = getStatusInfo(days);
        var emoji = CATEGORY_EMOJI[product.category] || '📦';
        var formattedDate = formatDate(product.expiryDate);
        var delay = Math.min(index * 0.06, 0.6);

        cardsHtml += ''
            + '<div class="product-card ' + status.cssClass + '" '
            + '     data-id="' + product.id + '" '
            + '     style="animation-delay: ' + delay + 's">'
            + '  <div class="card-status-strip"></div>'
            + '  <div class="card-header">'
            + '    <span class="card-emoji">' + emoji + '</span>'
            + '    <button class="delete-btn" data-delete-id="' + product.id + '" title="Ürünü Sil">'
            + '      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '        <polyline points="3 6 5 6 21 6"></polyline>'
            + '        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>'
            + '        <line x1="10" y1="11" x2="10" y2="17"></line>'
            + '        <line x1="14" y1="11" x2="14" y2="17"></line>'
            + '      </svg>'
            + '    </button>'
            + '  </div>'
            + '  <h3 class="card-title">' + escapeHtml(product.name) + '</h3>'
            + '  <span class="card-category">' + escapeHtml(product.category) + '</span>'
            + '  <div class="card-footer">'
            + '    <div class="card-date">'
            + '      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
            + '        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>'
            + '        <line x1="16" y1="2" x2="16" y2="6"></line>'
            + '        <line x1="8" y1="2" x2="8" y2="6"></line>'
            + '        <line x1="3" y1="10" x2="21" y2="10"></line>'
            + '      </svg>'
            + '      <span>SKT: ' + formattedDate + '</span>'
            + '    </div>'
            + '    <span class="card-status-badge">'
            + '      ' + status.icon + ' ' + status.label
            + '    </span>'
            + '  </div>'
            + '</div>';
    });

    grid.innerHTML = cardsHtml;

    // Attach delete handlers
    grid.querySelectorAll('[data-delete-id]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            handleDelete(btn.getAttribute('data-delete-id'));
        });
    });
}

async function handleDelete(id) {
    // Animate card removal
    var card = document.querySelector('[data-id="' + id + '"]');
    if (card) {
        card.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 1, 1)';
        card.style.transform = 'scale(0.85) translateY(10px)';
        card.style.opacity = '0';
    }

    var product = await removeProduct(id);
    if (product) {
        showToast('"' + product.name + '" başarıyla silindi.', 'info');
    }
    // Note: UI will auto-update via onSnapshot listener
}

// ==================== MODAL ====================
function openModal() {
    var modal = document.getElementById('modal-overlay');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    resetForm();
    switchTab('manual');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            modal.classList.add('modal-active');
        });
    });
    setTimeout(function () {
        document.getElementById('product-name').focus();
    }, 400);
}

function closeModal() {
    var modal = document.getElementById('modal-overlay');
    modal.classList.remove('modal-active');
    stopScanner();
    document.body.style.overflow = '';
    setTimeout(function () {
        modal.classList.add('hidden');
    }, 350);
}

function resetForm() {
    document.getElementById('product-name').value = '';
    document.getElementById('product-category').value = 'Gıda';
    document.getElementById('product-expiry').value = '';
    var barcodeResult = document.getElementById('barcode-result');
    if (barcodeResult) barcodeResult.innerHTML = '';
}

function switchTab(tab) {
    var manualTab = document.getElementById('tab-manual');
    var barcodeTab = document.getElementById('tab-barcode');
    var manualContent = document.getElementById('manual-content');
    var barcodeContent = document.getElementById('barcode-content');

    if (tab === 'manual') {
        manualTab.classList.add('tab-active');
        barcodeTab.classList.remove('tab-active');
        manualContent.classList.remove('hidden');
        barcodeContent.classList.add('hidden');
        stopScanner();
    } else {
        barcodeTab.classList.add('tab-active');
        manualTab.classList.remove('tab-active');
        barcodeContent.classList.remove('hidden');
        manualContent.classList.add('hidden');
        startScanner();
    }
}

// ==================== FORM SUBMISSION ====================
async function handleSubmit(e) {
    e.preventDefault();

    var name = document.getElementById('product-name').value.trim();
    var category = document.getElementById('product-category').value;
    var expiryDate = document.getElementById('product-expiry').value;

    if (!name) {
        showToast('Lütfen ürün adını giriniz.', 'error');
        document.getElementById('product-name').focus();
        return;
    }
    if (!expiryDate) {
        showToast('Lütfen son kullanma tarihini seçiniz.', 'error');
        document.getElementById('product-expiry').focus();
        return;
    }

    // Disable button during save
    var submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading-spinner-sm"></div> Kaydediliyor...';

    await addProduct(name, category, expiryDate);

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Ürünü Kaydet';

    closeModal();
    showToast('"' + name + '" başarıyla eklendi!', 'success');
    // Note: Grid will auto-update via onSnapshot
}

// ==================== BARCODE SCANNER ====================
function startScanner() {
    if (scannerRunning) return;

    var scannerDiv = document.getElementById('barcode-scanner');
    scannerDiv.innerHTML = '';

    try {
        html5QrCode = new Html5Qrcode('barcode-scanner');

        html5QrCode.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.7778,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.QR_CODE
                ]
            },
            onScanSuccess,
            function () { /* silent scan failures */ }
        ).then(function () {
            scannerRunning = true;
            document.getElementById('barcode-result').innerHTML =
                '<span class="text-slate-500">📸 Kamera aktif — barkodu çerçeveye alın</span>';
        }).catch(function (err) {
            console.error('Scanner start error:', err);
            showToast('Kamera açılamadı. Lütfen kamera izni veriniz.', 'error');
            document.getElementById('barcode-result').innerHTML =
                '<span class="text-red-500">Kamera erişimi reddedildi veya desteklenmiyor.</span>';
        });
    } catch (err) {
        console.error('Scanner init error:', err);
        showToast('Barkod tarayıcı başlatılamadı.', 'error');
    }
}

function stopScanner() {
    if (html5QrCode && scannerRunning) {
        html5QrCode.stop().then(function () {
            try { html5QrCode.clear(); } catch (e) { /* ignore */ }
            scannerRunning = false;
        }).catch(function () {
            scannerRunning = false;
        });
    }
}

function onScanSuccess(decodedText) {
    if (html5QrCode && scannerRunning) {
        html5QrCode.stop().then(function () {
            try { html5QrCode.clear(); } catch (e) { /* ignore */ }
            scannerRunning = false;
            lookupBarcode(decodedText);
        }).catch(function () {
            scannerRunning = false;
            lookupBarcode(decodedText);
        });
    } else {
        lookupBarcode(decodedText);
    }
}

function lookupBarcode(barcode) {
    var resultEl = document.getElementById('barcode-result');
    resultEl.innerHTML =
        '<span class="text-indigo-600">🔍 Barkod: <strong>' + escapeHtml(barcode) + '</strong></span>'
        + '<br><span class="text-slate-500">Ürün bilgisi aranıyor...</span>';

    var apiUrl = 'https://world.openfoodfacts.org/api/v0/product/' + encodeURIComponent(barcode) + '.json';

    fetch(apiUrl)
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (data) {
            if (data.status === 1 && data.product && data.product.product_name) {
                var productName = data.product.product_name;
                document.getElementById('product-name').value = productName;
                resultEl.innerHTML =
                    '<span class="text-emerald-600">✅ Ürün bulundu: <strong>' + escapeHtml(productName) + '</strong></span>';
                showToast('Ürün bulundu: ' + productName, 'success');
                setTimeout(function () {
                    switchTab('manual');
                    document.getElementById('product-expiry').focus();
                }, 600);
            } else {
                resultEl.innerHTML =
                    '<span class="text-amber-600">⚠️ Ürün veritabanında bulunamadı, lütfen manuel giriniz.</span>';
                showToast('Ürün veritabanında bulunamadı, lütfen manuel giriniz.', 'warning');
                setTimeout(function () {
                    switchTab('manual');
                    document.getElementById('product-name').focus();
                }, 800);
            }
        })
        .catch(function (err) {
            console.error('Open Food Facts API error:', err);
            resultEl.innerHTML =
                '<span class="text-red-600">❌ API bağlantı hatası. Lütfen manuel giriniz.</span>';
            showToast('API bağlantı hatası oluştu.', 'error');
            setTimeout(function () {
                switchTab('manual');
                document.getElementById('product-name').focus();
            }, 800);
        });
}

// ==================== TOAST SYSTEM ====================
function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var icon = TOAST_ICONS[type] || TOAST_ICONS.info;
    toast.innerHTML =
        '<span class="toast-icon">' + icon + '</span>'
        + '<span class="toast-message">' + escapeHtml(message) + '</span>';
    container.appendChild(toast);

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            toast.classList.add('toast-visible');
        });
    });

    setTimeout(function () {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-exit');
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 350);
    }, 3500);
}

// ==================== EVENT LISTENERS ====================
function init() {
    // Auth buttons
    document.getElementById('google-signin-btn').addEventListener('click', signInWithGoogle);
    document.getElementById('signout-btn').addEventListener('click', handleSignOut);

    // FAB button
    document.getElementById('fab-add').addEventListener('click', openModal);

    // Header add button
    var headerAddBtn = document.getElementById('header-add-btn');
    if (headerAddBtn) headerAddBtn.addEventListener('click', openModal);

    // Empty state add button
    var emptyAddBtn = document.getElementById('empty-add-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', openModal);

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
        if (e.target === e.currentTarget) closeModal();
    });

    // ESC to close modal
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var modal = document.getElementById('modal-overlay');
            if (!modal.classList.contains('hidden')) closeModal();
        }
    });

    // Tab buttons
    document.getElementById('tab-manual').addEventListener('click', function () { switchTab('manual'); });
    document.getElementById('tab-barcode').addEventListener('click', function () { switchTab('barcode'); });

    // Form submission
    document.getElementById('product-form').addEventListener('submit', handleSubmit);

    // Notification bell
    document.getElementById('notification-bell').addEventListener('click', function () {
        var expiredCount = 0;
        var warningCount = 0;
        currentProducts.forEach(function (p) {
            var days = getDaysRemaining(p.expiryDate);
            if (days < 0) expiredCount++;
            else if (days <= 3) warningCount++;
        });
        if (expiredCount === 0 && warningCount === 0) {
            showToast('Tüm ürünleriniz güvende! 🎉', 'success');
        } else {
            var msg = '';
            if (expiredCount > 0) msg += expiredCount + ' ürünün süresi geçmiş. ';
            if (warningCount > 0) msg += warningCount + ' ürünün süresi 3 gün içinde dolacak.';
            showToast(msg.trim(), expiredCount > 0 ? 'error' : 'warning');
        }
    });

    // Re-render every minute to keep colors fresh
    setInterval(function () {
        if (currentProducts.length > 0) renderProducts(currentProducts);
    }, 60000);
}

// ==================== SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js')
            .then(function (reg) { console.log('SW registered:', reg.scope); })
            .catch(function (err) { console.log('SW registration failed:', err); });
    });
}

// ==================== BOOTSTRAP ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
