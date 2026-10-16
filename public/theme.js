(() => {
  const key = 'folio-theme';
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch {}
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
  const moon = '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>';
  function apply(next) {
    theme = next;
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const dark = theme === 'dark';
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.setAttribute('aria-pressed', String(dark));
    button.title = button.getAttribute('aria-label');
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark ? moon : sun}</svg><span>${dark ? 'Dark' : 'Light'}</span>`;
  }
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.id = 'theme-toggle';
    button.type = 'button';
    button.className = 'theme-toggle';
    document.querySelector('.header-right')?.prepend(button);
    apply(theme);
    button.addEventListener('click', () => {
      apply(theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, theme); } catch {}
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key) apply(event.newValue === 'dark' ? 'dark' : 'light');
  });
})();
