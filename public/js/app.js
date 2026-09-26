(async () => {
  try {
    const a = await fetch('/js/app-body-p1.js').then((r) => r.text());
    const b = await fetch('/js/app-body-p2.js').then((r) => r.text());
    (0, eval)(a + b);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка загрузки: ' + e.message + '</div>';
  }
})();
