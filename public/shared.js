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
window.trackEvent = (event, details = {}) => {
    fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, details, timestamp: new Date().toISOString() })
    }).catch(() => {});
};

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
    trackEvent('page_view', { path: window.location.pathname });
});

window.addEventListener('load', initIcons);
