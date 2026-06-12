/* ── Shared JavaScript for VK Portfolio (all pages) ─────────────────────── */

// ── Theme management ────────────────────────────────────────────────────────
window.toggleMode = () => {
    const current = document.documentElement.getAttribute('data-mode') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    localStorage.setItem('theme-mode', next);
    updateThemeUI();
};

function updateThemeUI() {
    const mode = localStorage.getItem('theme-mode') || 'dark';
    document.documentElement.setAttribute('data-mode', mode);
    document.documentElement.setAttribute('data-theme', 'studio');
    const icon = document.getElementById('mode-icon');
    if (icon) {
        icon.setAttribute('data-lucide', mode === 'dark' ? 'sun' : 'moon');
        if (window.lucide) lucide.createIcons();
    }
    const label = document.getElementById('mode-label');
    if (label) label.textContent = mode === 'dark' ? 'Light' : 'Dark';
}

// ── Mobile menu ──────────────────────────────────────────────────────────────
window.toggleMenu = () => {
    const menu = document.getElementById('mobile-menu');
    const icon = document.getElementById('hamburger-icon');
    const btn  = document.getElementById('hamburger-btn');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !isHidden);
    document.body.style.overflow = isHidden ? 'hidden' : '';
    if (btn) btn.setAttribute('aria-expanded', String(isHidden));
    if (icon) {
        icon.setAttribute('data-lucide', isHidden ? 'x' : 'menu');
        if (window.lucide) lucide.createIcons();
    }
};

// ── Lucide icons init ────────────────────────────────────────────────────────
function initIcons() {
    if (window.lucide) lucide.createIcons();
    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
}

// ── Analytics (fire-and-forget) ──────────────────────────────────────────────

// One ID per browser tab session (cleared when the tab/window is closed).
function getSessionId() {
    let id = sessionStorage.getItem('vk_session_id');
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        sessionStorage.setItem('vk_session_id', id);
    }
    return id;
}

// New vs returning visitor — persisted per-browser, no cookies/PII.
// Decided once per session so every page_view in the session agrees.
function isNewVisitor() {
    const cached = sessionStorage.getItem('vk_new_visitor');
    if (cached !== null) return cached === '1';
    const isNew = !localStorage.getItem('vk_returning_visitor');
    localStorage.setItem('vk_returning_visitor', '1');
    sessionStorage.setItem('vk_new_visitor', isNew ? '1' : '0');
    return isNew;
}

window.trackEvent = (event, details = {}) => {
    const payload = JSON.stringify({
        event,
        details,
        sessionId: getSessionId(),
        timestamp: new Date().toISOString()
    });
    fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
    }).catch(() => {});
};

// Fire-and-forget beacon for events sent as the page is being unloaded.
window.trackEventBeacon = (event, details = {}) => {
    const payload = JSON.stringify({
        event,
        details,
        sessionId: getSessionId(),
        timestamp: new Date().toISOString()
    });
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics', new Blob([payload], { type: 'application/json' }));
    } else {
        fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
};

// ── Time on page & scroll depth ──────────────────────────────────────────────
function initEngagementTracking() {
    const pageStart = performance.now();
    let maxScroll = 0;
    let sent = false;

    function currentScrollDepth() {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - doc.clientHeight;
        if (scrollable <= 0) return 100;
        const pct = ((window.scrollY || doc.scrollTop) / scrollable) * 100;
        return Math.min(100, Math.max(0, Math.round(pct)));
    }

    window.addEventListener('scroll', () => {
        maxScroll = Math.max(maxScroll, currentScrollDepth());
    }, { passive: true });

    function sendExit() {
        if (sent) return;
        sent = true;
        const duration = Math.round((performance.now() - pageStart) / 1000);
        trackEventBeacon('page_exit', {
            path: window.location.pathname,
            duration,
            scrollDepth: maxScroll
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendExit();
    });
    window.addEventListener('pagehide', sendExit);
}

// ── Privacy modal ────────────────────────────────────────────────────────────
window.openPrivacy = () => {
    const modal = document.getElementById('privacy-modal');
    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; initIcons(); }
};
window.closePrivacy = () => {
    const modal = document.getElementById('privacy-modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }
};

// ── DB status badge (footer) ─────────────────────────────────────────────────
async function updateDbStatus() {
    try {
        const res = await fetch('/api/db-status');
        const data = await res.json();
        const container = document.getElementById('db-status-container');
        const dot  = document.getElementById('db-status-dot');
        const text = document.getElementById('db-status-text');
        if (!container) return;
        container.classList.remove('hidden');
        container.classList.add('flex');
        if (data.status === 'active') {
            dot.classList.add('bg-[#4ECC9F]'); dot.classList.remove('bg-red-500');
            text.textContent = `${data.type} Persistent`;
            container.title  = `Storage: ${data.persistence}`;
        } else {
            dot.classList.add('bg-red-500'); dot.classList.remove('bg-[#4ECC9F]');
            text.textContent = 'Storage Offline';
        }
    } catch {}
}

// ── Scroll reveal ────────────────────────────────────────────────────────────
function initScrollReveal() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });
    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
}

// ── Animated stat counters ───────────────────────────────────────────────────
function initStatCounters() {
    function animateCounter(el) {
        const target   = parseInt(el.dataset.target, 10);
        const suffix   = el.dataset.suffix || '';
        const duration = 1400;
        const start    = performance.now();
        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(eased * target) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
    const statsObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.querySelectorAll('.stat-number').forEach(animateCounter);
                statsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    const section = document.getElementById('stats-section');
    if (section) statsObserver.observe(section);
}

// ── Link click tracking ──────────────────────────────────────────────────────
function initLinkTracking() {
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            trackEvent('link_click', { label: link.innerText.trim() || link.getAttribute('href'), url: link.getAttribute('href') });
        });
    });
}

// ── Active nav highlight ─────────────────────────────────────────────────────
function highlightActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('[data-nav-path]').forEach(el => {
        if (el.dataset.navPath === path || (path === '/' && el.dataset.navPath === '/')) {
            el.classList.add('nav-link-active');
        }
    });
}

// ── Bootstrap on DOM ready ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateThemeUI();
    initIcons();
    initScrollReveal();
    initStatCounters();
    initLinkTracking();
    highlightActiveNav();
    updateDbStatus();
    initEngagementTracking();
    trackEvent('page_view', {
        path: window.location.pathname,
        referrer: document.referrer || null,
        newVisitor: isNewVisitor()
    });
});

window.addEventListener('load', initIcons);
