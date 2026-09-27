(function(){
  Promise.all([
    fetch("/js/app.full.1.js").then(function(r){ if(!r.ok) throw new Error("JS1 "+r.status); return r.text(); }),
    fetch("/js/app.full.2.js").then(function(r){ if(!r.ok) throw new Error("JS2 "+r.status); return r.text(); })
  ]).then(function(parts){
    (0,eval)(parts[0] + parts[1]);
  }).catch(function(e){
    console.error(e);
    var el = document.getElementById("page-dashboard");
    if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка загрузки JS: " + (e.message||e) + "</div>";
  });
})();
