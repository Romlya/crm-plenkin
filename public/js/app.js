(function(){
  var urls = ["/js/bundle-b64-0.txt","/js/bundle-b64-1.txt","/js/bundle-b64-2.txt","/js/bundle-b64-3.txt"];
  Promise.all(urls.map(function(u){ return fetch(u).then(function(r){ if(!r.ok) throw new Error(u+" "+r.status); return r.text(); }); }))
  .then(function(parts){
    var b64 = parts.join("");
    var bin = atob(b64);
    var code = bin;
    try { code = decodeURIComponent(escape(bin)); } catch(e) {}
    (0,eval)(code);
  })
  .catch(function(e){
    console.error(e);
    var el = document.getElementById("page-dashboard");
    if(el) el.innerHTML = "<div class=\"empty-hint\">Ошибка JS: "+(e.message||e)+"</div>";
  });
})();
