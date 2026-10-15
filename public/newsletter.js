/* Newsletter pages. The unsubscribe link in an email lands on a page whose form
 * submits itself, so a person needs exactly one click. Link scanners that only
 * fetch the URL (and run no script) do not unsubscribe anyone. */
document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[data-auto-submit]');
    if (form) {
        const btn = form.querySelector('button');
        if (btn) { btn.disabled = true; btn.textContent = 'Unsubscribing…'; }
        form.submit();
    }
});
