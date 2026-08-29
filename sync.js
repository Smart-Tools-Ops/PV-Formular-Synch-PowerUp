/* Sync-Logik für Kartensynchronisation zwischen zwei Boards.
   Nutzt die Trello REST API (Autorisierung via getRestApi) und ein
   Verknüpfungs-Register auf Workspace-Ebene (organization/shared), damit
   beide Karten ihren Partner finden. Voraussetzung: beide Boards liegen im
   selben Workspace (Arbeitsbereich). */

var APP_NAME = 'PV Work List';

/* Zugriffs-Token wird im Browser-Speicher der Power-Up-Seite abgelegt
   (pro Nutzer/Gerät) und manuell einmalig eingetragen. Das ist zuverlässig
   in der eingebetteten Ansicht und umgeht das fehleranfällige OAuth-Popup. */
function getStoredToken(){ try { return localStorage.getItem('pvSyncToken') || null; } catch(e){ return null; } }
function setStoredToken(token){ try { localStorage.setItem('pvSyncToken', token); return true; } catch(e){ return false; } }
function clearStoredToken(){ try { localStorage.removeItem('pvSyncToken'); } catch(e){} }
function authorizeUrl(){
  return 'https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token'
    + '&name=' + encodeURIComponent(APP_NAME) + '&key=' + encodeURIComponent(APP_KEY);
}

/* --- REST-Aufruf: GET über Query, Schreibzugriffe über Formular-Body --- */
function api(t, method, path, params){
  var token = getStoredToken();
  if(!token) return Promise.reject(new Error('Kein Trello-Zugriffscode gespeichert.'));
  params = params || {};
  params.key = APP_KEY; params.token = token;
  var enc = Object.keys(params).map(function(k){
    return encodeURIComponent(k)+'='+encodeURIComponent(params[k]==null?'':params[k]);
  }).join('&');
  var url = 'https://api.trello.com/1/'+path, opts;
  if(method==='GET'){ url += (path.indexOf('?')>-1?'&':'?')+enc; opts={ method:'GET' }; }
  else { opts={ method:method, headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:enc }; }
  return fetch(url, opts).then(function(r){
    if(!r.ok) return r.text().then(function(x){ throw new Error('Trello-API '+r.status+': '+x); });
    if(r.status===204) return null;
    return r.json().catch(function(){ return null; });
  });
}

/* --- Verknüpfungs-Register (Workspace-Ebene, für beide Karten sichtbar) --- */
/* v2: Verknüpfung liegt auf der Karte selbst (card/shared) -> nutzer- und
   workspace-übergreifend, von jedem Karten-Bearbeiter beschreibbar. */
function getLink(t){ return t.get('card','shared','synclink').then(function(v){ return v||null; }); }
function setLinkLocal(t, link){ return t.set('card','shared','synclink', link); }
function clearLinkLocal(t){ return t.remove('card','shared','synclink'); }

/* Marker-Anhang, mit dem die Kopie beim ersten Öffnen ihren Partner findet. */
function addMarker(t, cardId, originId, originBoard){
  return api(t,'POST','cards/'+cardId+'/attachments', { name:'PV-Sync (automatisch, wird entfernt)', url:'https://trello.com/?pvsync='+originId+'.'+originBoard });
}
function findMarker(t, cardId){
  return api(t,'GET','cards/'+cardId+'/attachments', { fields:'name,url' }).then(function(list){
    for(var i=0;i<(list||[]).length;i++){
      var u=list[i].url||''; var k=u.indexOf('pvsync=');
      if(k>-1){ var val=u.substring(k+7).split('.'); return { origin:val[0], originBoard:val[1], attachId:list[i].id }; }
    }
    return null;
  });
}
function deleteMarker(t, cardId, attachId){ return api(t,'DELETE','cards/'+cardId+'/attachments/'+attachId, {}); }

/* Partnerdaten (Formular + Verknüpfung) per REST lesen */
function getRemoteData(t, cardId, pluginId){
  return api(t,'GET','cards/'+cardId+'/pluginData', {}).then(function(list){
    var out={ projektdaten:null, synclink:null };
    for(var i=0;i<(list||[]).length;i++){
      if(String(list[i].idPlugin)===String(pluginId)){
        try { var v=JSON.parse(list[i].value); out.projektdaten=v.projektdaten||null; out.synclink=v.synclink||null; } catch(e){}
      }
    }
    return out;
  });
}

/* --- Karten-Kernfelder --- */
function getCore(t, cardId){
  return api(t,'GET','cards/'+cardId, { fields:'name,desc,due,dateLastActivity,idBoard,idList,idLabels' });
}
function getBoardLabels(t, boardId){
  return api(t,'GET','boards/'+boardId+'/labels', { fields:'name,color', limit:1000 });
}

/* Quell-Label-IDs -> Ziel-Label-IDs (per Name+Farbe; fehlende Labels werden angelegt) */
function mapLabels(t, srcIdLabels, srcBoardId, tgtBoardId){
  if(!srcIdLabels || !srcIdLabels.length) return Promise.resolve([]);
  return Promise.all([ getBoardLabels(t, srcBoardId), getBoardLabels(t, tgtBoardId) ]).then(function(res){
    var src = res[0] || [], tgt = res[1] || [];
    var srcById = {}; src.forEach(function(l){ srcById[l.id] = l; });
    function findTgt(name, color){
      for(var i=0;i<tgt.length;i++){ if((tgt[i].name||'')===(name||'') && (tgt[i].color||'')===(color||'')) return tgt[i]; }
      return null;
    }
    var chain = Promise.resolve(), out = [];
    srcIdLabels.forEach(function(id){
      var l = srcById[id]; if(!l) return;
      chain = chain.then(function(){
        var m = findTgt(l.name, l.color);
        if(m){ out.push(m.id); return; }
        return api(t,'POST','labels', { idBoard:tgtBoardId, name:l.name||'', color:l.color||'' })
          .then(function(nl){ if(nl && nl.id){ tgt.push(nl); out.push(nl.id); } });
      });
    });
    return chain.then(function(){ return out; });
  });
}

/* Kernfelder von "source" auf die Zielkarte schreiben */
function applyCore(t, targetCardId, source, tgtIdLabels){
  return api(t,'PUT','cards/'+targetCardId, {
    name: source.name!=null ? source.name : '',
    desc: source.desc!=null ? source.desc : '',
    due:  source.due ? source.due : '',
    idLabels: (tgtIdLabels||[]).join(',')
  });
}

/* Formulardaten (projektdaten) der Partnerkarte lesen – nur Lesen ist per API möglich */
function getRemoteForm(t, cardId, pluginId){
  return api(t,'GET','cards/'+cardId+'/pluginData', {}).then(function(list){
    if(!list || !list.length) return null;
    for(var i=0;i<list.length;i++){
      if(String(list[i].idPlugin) === String(pluginId)){
        try { var v = JSON.parse(list[i].value); return v.projektdaten || null; }
        catch(e){ return null; }
      }
    }
    return null;
  });
}

/* Verbindung trennen: nur die eigene Karten-Verknüpfung entfernen.
   Die Partnerkarte erkennt beim nächsten Öffnen/Abgleich, dass die
   Rückverknüpfung fehlt, und trennt sich dann selbst. */
function stopSync(t){
  return clearLinkLocal(t);
}

/* --- Kommentare (Best-Effort, Dedup per Text) --- */
function getComments(t, cardId){
  return api(t,'GET','cards/'+cardId+'/actions', { filter:'commentCard', limit:50 }).then(function(list){
    return (list||[]).map(function(a){ return (a.data && a.data.text) || ''; }).filter(function(x){ return x; });
  });
}
function postComment(t, cardId, text){
  return api(t,'POST','cards/'+cardId+'/actions/comments', { text:text });
}
function syncComments(t, aId, bId){
  return Promise.all([ getComments(t,aId), getComments(t,bId) ]).then(function(res){
    var aT=res[0]||[], bT=res[1]||[], ops=[];
    aT.forEach(function(txt){ if(bT.indexOf(txt)<0) ops.push(postComment(t,bId,txt)); });
    bT.forEach(function(txt){ if(aT.indexOf(txt)<0) ops.push(postComment(t,aId,txt)); });
    return Promise.all(ops);
  });
}

/* --- Anhänge (Best-Effort: als Link-Verweis, Dedup per URL) --- */
function getAttachments(t, cardId){
  return api(t,'GET','cards/'+cardId+'/attachments', { fields:'name,url' }).then(function(list){
    return (list||[]).map(function(a){ return { name:a.name||'', url:a.url||'' }; })
      .filter(function(a){ return a.url && a.url.indexOf('pvsync=')<0; });
  });
}
function postAttachment(t, cardId, att){
  return api(t,'POST','cards/'+cardId+'/attachments', { url:att.url, name:att.name });
}
function syncAttachments(t, aId, bId){
  return Promise.all([ getAttachments(t,aId), getAttachments(t,bId) ]).then(function(res){
    var a=res[0]||[], b=res[1]||[];
    var aUrls=a.map(function(x){return x.url;}), bUrls=b.map(function(x){return x.url;});
    var ops=[];
    a.forEach(function(x){ if(bUrls.indexOf(x.url)<0) ops.push(postAttachment(t,bId,x).catch(function(){})); });
    b.forEach(function(x){ if(aUrls.indexOf(x.url)<0) ops.push(postAttachment(t,aId,x).catch(function(){})); });
    return Promise.all(ops);
  });
}
