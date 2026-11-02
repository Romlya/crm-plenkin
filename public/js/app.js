(function () {
  var n = 56;
  var urls = [];
  for (var i = 0; i < n; i++) urls.push('/js/app-b' + i + '.js?v=2');

  function extract(src) {
    var m = src.match(/\.push\('([^']*)'\)/);
    if (m) return m[1];
    m = src.match(/\.push\("([^"]*)"\)/);
    if (m) return m[1];
    return '';
  }

  function showErr(e) {
    console.error(e);
    var el = document.getElementById('page-dashboard');
    if (el) el.innerHTML = '<div class="empty-hint">Ошибка JS: ' + (e && e.message ? e.message : e) + '</div>';
  }

  Promise.all(
    urls.map(function (u) {
      return fetch(u).then(function (r) {
        if (!r.ok) throw new Error(u + ' ' + r.status);
        return r.text();
      });
    })
  )
    .then(function (texts) {
      var b64 = texts.map(extract).join('');
      if (!b64) throw new Error('empty base64');
      // pad for atob
      var pad = (4 - (b64.length % 4)) % 4;
      if (pad) b64 += '===='.slice(0, pad);
      var bin;
      try {
        bin = atob(b64);
      } catch (e) {
        throw new Error('atob failed, len=' + b64.length + ' ' + (e.message || e));
      }
      var code = bin;
      try {
        code = decodeURIComponent(escape(bin));
      } catch (e) {}
      (0, eval)(code);
    })
    .catch(showErr);
})();
