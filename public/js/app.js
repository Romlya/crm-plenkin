(function(){
  fetch("/js/app.bundle.js")
    .then(function(r){ if(!r.ok) throw new Error("app.bundle.js "+r.status); return r.text(); })
    .then(function(code){ (0,eval)(code); })
    .catch(function(e){
      console.error(e);
      var el = document.getElementById("page-dashboard");
      if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка загрузки JS: " + (e.message||e) + "<br>Обновите деплой: нужен /js/app.bundle.js</div>";
    });
})();
