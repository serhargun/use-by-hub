/* ============================================================
   Use-By Hub — Application Logic
   Son Kullanma Tarihi Takip Uygulaması
   ============================================================ */

(function () {
    'use strict';

    // ==================== CONSTANTS ====================
    const STORAGE_KEY = 'useByHub_products';

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

    // ==================== DATA LAYER ====================
    function loadProducts() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('LocalStorage read error:', e);
            return [];
        }
    }

    function saveProducts(products) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
        } catch (e) {
            console.error('LocalStorage write error:', e);
            showToast('Veriler kaydedilirken hata oluştu!', 'error');
        }
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    }

    function addProduct(name, category, expiryDate) {
        const products = loadProducts();
        const product = {
            id: generateId(),
            name: name.trim(),
            category: category,
            expiryDate: expiryDate,
            createdAt: new Date().toISOString()
        };
        products.push(product);
        saveProducts(products);
        return product;
    }

    function removeProduct(id) {
        let products = loadProducts();
        const removed = products.find(p => p.id === id);
        products = products.filter(p => p.id !== id);
        saveProducts(products);
        return removed;
    }

    // ==================== DATE UTILITIES ====================
    function getDaysRemaining(expiryDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate + 'T00:00:00');
        expiry.setHours(0, 0, 0, 0);
        const diffMs = expiry.getTime() - today.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    function formatDate(dateStr) {
        try {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    function getStatusInfo(days) {
        if (days < 0) {
            return {
                cssClass: 'status-expired',
                label: 'Süresi Geçti',
                icon: '⛔',
                priority: 0
            };
        } else if (days === 0) {
            return {
                cssClass: 'status-today',
                label: 'Bugün Son Gün!',
                icon: '🔴',
                priority: 1
            };
        } else if (days <= 3) {
            return {
                cssClass: 'status-warning',
                label: 'Dikkat: ' + days + ' Gün Kaldı',
                icon: '🟠',
                priority: 2
            };
        } else if (days <= 7) {
            return {
                cssClass: 'status-soon',
                label: days + ' Gün Kaldı',
                icon: '🟡',
                priority: 3
            };
        } else {
            return {
                cssClass: 'status-safe',
                label: days + ' Gün Kaldı',
                icon: '🟢',
                priority: 4
            };
        }
    }

    // ==================== RENDERING ====================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderProducts() {
        const products = loadProducts();

        // Sort by expiry date ascending (nearest first)
        products.sort(function (a, b) {
            return new Date(a.expiryDate) - new Date(b.expiryDate);
        });

        const grid = document.getElementById('product-grid');
        const emptyState = document.getElementById('empty-state');
        const statsBar = document.getElementById('stats-bar');
        const badge = document.getElementById('notification-badge');
        const bellBtn = document.getElementById('notification-bell');

        // Compute stats
        let alertCount = 0;
        let warningCount = 0;
        let expiredCount = 0;

        products.forEach(function (p) {
            const days = getDaysRemaining(p.expiryDate);
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
            // Remove shake class after animation so it can re-trigger
            setTimeout(function () {
                bellBtn.classList.remove('bell-shake');
            }, 900);
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

        // Attach delete handlers via event delegation
        grid.querySelectorAll('[data-delete-id]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = btn.getAttribute('data-delete-id');
                handleDelete(id);
            });
        });
    }

    function handleDelete(id) {
        var product = removeProduct(id);
        if (product) {
            // Animate card removal
            var card = document.querySelector('[data-id="' + id + '"]');
            if (card) {
                card.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 1, 1)';
                card.style.transform = 'scale(0.85) translateY(10px)';
                card.style.opacity = '0';
                setTimeout(function () {
                    renderProducts();
                }, 350);
            } else {
                renderProducts();
            }
            showToast('"' + product.name + '" başarıyla silindi.', 'info');
        }
    }

    // ==================== MODAL ====================
    function openModal() {
        var modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        resetForm();
        switchTab('manual');
        // Trigger animation on next frame
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                modal.classList.add('modal-active');
            });
        });
        // Focus product name input
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
    function handleSubmit(e) {
        e.preventDefault();

        var name = document.getElementById('product-name').value.trim();
        var category = document.getElementById('product-category').value;
        var expiryDate = document.getElementById('product-expiry').value;

        // Validation
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

        addProduct(name, category, expiryDate);
        closeModal();
        renderProducts();
        showToast('"' + name + '" başarıyla eklendi!', 'success');
    }

    // ==================== BARCODE SCANNER ====================
    function startScanner() {
        if (scannerRunning) return;

        var scannerDiv = document.getElementById('barcode-scanner');
        // Clear any previous content
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
                onScanFailure
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
            document.getElementById('barcode-result').innerHTML =
                '<span class="text-red-500">Barkod tarayıcı desteklenmiyor.</span>';
        }
    }

    function stopScanner() {
        if (html5QrCode && scannerRunning) {
            html5QrCode.stop().then(function () {
                try { html5QrCode.clear(); } catch (e) { /* ignore */ }
                scannerRunning = false;
            }).catch(function (err) {
                console.error('Scanner stop error:', err);
                scannerRunning = false;
            });
        }
    }

    function onScanSuccess(decodedText) {
        // Stop scanner first
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

    function onScanFailure() {
        // Silent — scan failures happen constantly until a barcode is found
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

                    // Switch to manual tab so user can fill in the rest
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
                showToast('API bağlantı hatası oluştu. Lütfen manuel giriş yapınız.', 'error');

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

        // Trigger enter animation on next frame
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                toast.classList.add('toast-visible');
            });
        });

        // Auto-dismiss after 3.5 seconds
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
        // FAB button
        document.getElementById('fab-add').addEventListener('click', openModal);

        // Header add button
        var headerAddBtn = document.getElementById('header-add-btn');
        if (headerAddBtn) headerAddBtn.addEventListener('click', openModal);

        // Empty state add button
        var emptyAddBtn = document.getElementById('empty-add-btn');
        if (emptyAddBtn) emptyAddBtn.addEventListener('click', openModal);

        // Modal close button
        document.getElementById('modal-close').addEventListener('click', closeModal);

        // Click backdrop to close
        document.getElementById('modal-overlay').addEventListener('click', function (e) {
            if (e.target === e.currentTarget) closeModal();
        });

        // ESC key to close modal
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var modal = document.getElementById('modal-overlay');
                if (!modal.classList.contains('hidden')) {
                    closeModal();
                }
            }
        });

        // Tab buttons
        document.getElementById('tab-manual').addEventListener('click', function () {
            switchTab('manual');
        });
        document.getElementById('tab-barcode').addEventListener('click', function () {
            switchTab('barcode');
        });

        // Form submission
        document.getElementById('product-form').addEventListener('submit', handleSubmit);

        // Notification bell click — show a summary toast
        document.getElementById('notification-bell').addEventListener('click', function () {
            var products = loadProducts();
            var expiredCount = 0;
            var warningCount = 0;

            products.forEach(function (p) {
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

        // Initial render
        renderProducts();

        // Set up daily check — re-render every minute to keep colors updated
        setInterval(renderProducts, 60000);
    }

    // ==================== SERVICE WORKER ====================
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
                navigator.serviceWorker.register('sw.js')
                    .then(function (reg) {
                        console.log('Service Worker registered, scope:', reg.scope);
                    })
                    .catch(function (err) {
                        console.log('Service Worker registration failed:', err);
                    });
            });
        }
    }

    // ==================== BOOTSTRAP ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    registerServiceWorker();

})();
