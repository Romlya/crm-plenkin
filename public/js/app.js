(function(){
  var urls = ["/js/app.part0.b64","/js/app.part1.b64","/js/app.part2.b64","/js/app.part3.b64","/js/app.part4.b64","/js/app.part5.b64","/js/app.part6.b64","/js/app.part7.b64"];
  Promise.all(urls.map(function(u){
    return fetch(u).then(function(r){ if(!r.ok) throw new Error(u+" "+r.status); return r.text(); });
  })).then(function(parts){
    var b64 = parts.join("");
    var bin = atob(b64);
    var code = bin;
    try { code = decodeURIComponent(escape(bin)); } catch(e) {}
    (0,eval)(code);
  }).catch(function(e){
    console.error(e);
    var el = document.getElementById("page-dashboard");
    if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка загрузки JS: " + (e.message||e) + "</div>";
  });
})();
