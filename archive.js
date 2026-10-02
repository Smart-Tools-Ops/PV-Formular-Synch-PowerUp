/* =====================================================================
   archive.js – Karte als PDF archivieren
   Erzeugt ein PDF der kompletten Trello-Karte:
   Kartenkopf (Board, Liste, Labels, Mitglieder, Termine), alle Blöcke des
   Power-Up-Formulars, formatierte Beschreibung (inkl. eingefügter Bilder),
   Bildergalerie der Anhänge, Dateien als Links, Checklisten und Kommentare.

   Benötigt im Browser: config.js (Felddefinitionen, APP_KEY) und sync.js mit
   erteilter Trello-Freigabe (api(), getStoredToken()) – ohne Freigabe fehlen
   Bilder, Checklisten und Kommentare (das PDF weist darauf hin).
   Die PDF-Bibliothek (pdf-lib) wird erst beim Klick nachgeladen.
   ===================================================================== */

var PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
var ARCHIVE_IMG_MAX = 1600;      // längste Bildkante in Pixel (hält das PDF klein)
var ARCHIVE_IMG_QUALITY = 0.85;  // JPEG-Qualität

/* ---------- Bibliothek nachladen ---------- */
function loadPdfLib(){
  if (typeof PDFLib !== 'undefined') return Promise.resolve(PDFLib);
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = PDFLIB_URL;
    s.onload = function(){ resolve(window.PDFLib); };
    s.onerror = function(){ reject(new Error('PDF-Bibliothek konnte nicht geladen werden (Internetverbindung?).')); };
    document.head.appendChild(s);
  });
}

/* ---------- Hilfen für Anhänge ---------- */
var IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg)(\?|$)/i;
function fileExt(name, url){
  var m = String(name || '').match(/\.([a-z0-9]{1,5})$/i) || String(url || '').split('?')[0].match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : '';
}
function isImageAttachment(a){
  if (a.mimeType) return /^image\//i.test(a.mimeType);
  return IMG_EXT.test(a.name || '') || IMG_EXT.test(String(a.url || '').split('?')[0]);
}
/* Schlüssel, unter dem ein Bild abgelegt wird: Anhang-ID bei Trello-Anhängen, sonst die URL */
function imgKey(url){
  var m = String(url || '').match(/\/attachments\/([a-f0-9]{24})/i);
  return m ? 'att:' + m[1].toLowerCase() : String(url || '');
}
function hasToken(){
  return (typeof getStoredToken === 'function') && !!getStoredToken() && typeof APP_KEY !== 'undefined' && APP_KEY;
}

/* ---------- Kartendaten einsammeln ---------- */
function collectCardForArchive(t){
  return Promise.all([
    t.card('all'),
    t.list('name').catch(function(){ return {}; }),
    t.board('name').catch(function(){ return {}; })
  ]).then(function(res){
    var c = res[0] || {};
    var card = {
      id: c.id,
      name: c.name || '',
      desc: c.desc || '',
      url: c.url || '',
      boardName: (res[2] && res[2].name) || '',
      listName: (res[1] && res[1].name) || '',
      labels: (c.labels || []).map(function(l){ return { name: l.name || '', color: l.color || '' }; }),
      members: (c.members || []).map(function(m){ return m.fullName || m.username || ''; }),
      start: c.start || null,
      due: c.due || null,
      dueComplete: !!c.dueComplete,
      created: c.id ? new Date(parseInt(c.id.substring(0, 8), 16) * 1000) : null,
      attachments: (c.attachments || []).map(normAttachment),
      checklists: null,
      comments: null,
      authMissing: !hasToken()
    };
    if (!hasToken() || typeof api !== 'function' || !card.id) return card;

    return api(t, 'GET', 'cards/' + card.id, {
      fields: 'name,desc',
      checklists: 'all',
      attachments: 'true',
      actions: 'commentCard',
      actions_limit: 1000
    }).then(function(full){
      if (full.desc != null) card.desc = full.desc;
      if (full.attachments) card.attachments = full.attachments.map(normAttachment);
      card.checklists = (full.checklists || []).map(function(cl){
        return {
          name: cl.name,
          items: (cl.checkItems || []).slice().sort(function(a, b){ return a.pos - b.pos; })
            .map(function(i){ return { name: i.name, done: i.state === 'complete' }; })
        };
      });
      card.comments = (full.actions || []).map(function(a){
        return {
          author: (a.memberCreator && (a.memberCreator.fullName || a.memberCreator.username)) || 'Unbekannt',
          date: a.date,
          text: (a.data && a.data.text) || ''
        };
      }).reverse(); // älteste zuerst
      return card;
    }).catch(function(){ return card; });
  });
}

function normAttachment(a){
  return {
    id: a.id, name: a.name || a.url, url: a.url, date: a.date,
    mimeType: a.mimeType || '', bytes: a.bytes || 0,
    isUpload: a.isUpload !== false,
    previews: (a.previews || []).map(function(p){ return { url: p.url, width: p.width, height: p.height }; })
  };
}

/* ---------- Bilder laden (Browser) ---------- */
/* Adresse deines Cloudflare Workers (siehe bild-proxy-worker.js), z. B.
   'https://pv-bilder.DEINNAME.workers.dev'. Leer = Bilder direkt bei Trello versuchen
   (wird vom Browser meist blockiert). */
var ARCHIVE_IMAGE_PROXY = '';

function isTrelloApiUrl(url){ return /^https:\/\/(api\.)?trello\.com\/1\//.test(url); }
function oauthHeader(){ return 'OAuth oauth_consumer_key="' + APP_KEY + '", oauth_token="' + getStoredToken() + '"'; }
function fetchWithTimeout(url, opts, ms){
  return new Promise(function(resolve, reject){
    var done = false;
    setTimeout(function(){ if (!done){ done = true; reject(new Error('Zeitüberschreitung')); } }, ms);
    fetch(url, opts).then(function(r){ if (!done){ done = true; resolve(r); } }, function(e){ if (!done){ done = true; reject(e); } });
  });
}
function blobFrom(url, opts, label){
  return fetchWithTimeout(url, opts, 30000).then(function(r){
    if (!r.ok) throw new Error(label + ': HTTP ' + r.status);
    return r.blob();
  }, function(e){
    throw new Error(label + ': ' + ((e && e.message) || 'blockiert') + (/fetch|network|load/i.test(String(e && e.message)) ? ' (vom Browser blockiert)' : ''));
  });
}
/* Reihenfolge: 1. eigener Bild-Proxy, 2. Trello direkt mit Header, 3. Trello direkt mit Parametern */
function fetchBlob(url){
  var trello = isTrelloApiUrl(url), tok = hasToken();
  var apiUrl = trello ? url.replace('https://trello.com/', 'https://api.trello.com/') : url;
  var tries = [];
  if (ARCHIVE_IMAGE_PROXY){
    tries.push(function(){
      var h = (trello && tok) ? { 'Authorization': oauthHeader() } : {};
      return blobFrom(ARCHIVE_IMAGE_PROXY.replace(/\/+$/, '') + '/?url=' + encodeURIComponent(apiUrl), { headers: h, credentials: 'omit' }, 'Proxy');
    });
  }
  if (trello && tok){
    tries.push(function(){ return blobFrom(apiUrl, { headers: { 'Authorization': oauthHeader() }, credentials: 'omit' }, 'Trello'); });
    tries.push(function(){
      return blobFrom(apiUrl + (apiUrl.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(APP_KEY) + '&token=' + encodeURIComponent(getStoredToken()),
                      { credentials: 'omit' }, 'Trello');
    });
  } else {
    tries.push(function(){ return blobFrom(url, { credentials: 'omit' }, trello ? 'Trello (ohne Freigabe)' : 'Bildquelle'); });
  }
  var i = 0, firstErr = null;
  function next(err){
    if (err && !firstErr) firstErr = err;
    if (i >= tries.length) return Promise.reject(firstErr || err);
    return tries[i++]().then(function(b){
      if (b.type && !/^image\//.test(b.type) && !/octet-stream/.test(b.type)) throw new Error('keine Bilddatei (' + b.type + ')');
      return b;
    }).catch(next);
  }
  return next();
}
/* Bild in ein verkleinertes JPEG umrechnen (dreht Handyfotos richtig, wandelt WebP/GIF usw. um) */
function blobToJpeg(blob){
  function fromSource(src, w, h, cleanup){
    var scale = Math.min(1, ARCHIVE_IMG_MAX / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(src, 0, 0, cw, ch);
    if (cleanup) cleanup();
    return new Promise(function(res, rej){
      cv.toBlob(function(b){ b ? res(b) : rej(new Error('Umwandlung fehlgeschlagen')); }, 'image/jpeg', ARCHIVE_IMG_QUALITY);
    }).then(function(b){ return b.arrayBuffer(); }).then(function(buf){
      return { bytes: new Uint8Array(buf), kind: 'jpg', w: cw, h: ch };
    });
  }
  var viaBitmap = (typeof createImageBitmap === 'function')
    ? createImageBitmap(blob, { imageOrientation: 'from-image' }).then(function(bmp){
        return fromSource(bmp, bmp.width, bmp.height, function(){ bmp.close && bmp.close(); });
      })
    : Promise.reject();
  return viaBitmap.catch(function(){
    return new Promise(function(res, rej){
      var u = URL.createObjectURL(blob), img = new Image();
      img.onload = function(){ res(fromSource(img, img.naturalWidth || 800, img.naturalHeight || 600, function(){ URL.revokeObjectURL(u); })); };
      img.onerror = function(){ URL.revokeObjectURL(u); rej(new Error('Bildformat nicht lesbar')); };
      img.src = u;
    });
  });
}
/* Kandidaten-URLs für ein Bild: passende Vorschau (schneller, kleiner), dann Original */
function candidateUrls(att, url){
  var list = [];
  if (att && att.previews && att.previews.length){
    var ps = att.previews.slice().sort(function(a, b){ return (a.width || 0) - (b.width || 0); });
    var good = ps.filter(function(p){ return Math.max(p.width || 0, p.height || 0) >= 1000; })[0] || ps[ps.length - 1];
    if (good && good.url) list.push(good.url);
  }
  if (att && att.url) list.push(att.url);
  if (url && list.indexOf(url) < 0) list.push(url);
  return list;
}
function loadOneImage(urls){
  var i = 0;
  function next(err){
    if (i >= urls.length) return Promise.reject(err || new Error('nicht erreichbar'));
    var u = urls[i++];
    return fetchBlob(u).then(blobToJpeg).catch(function(e){ return next(err || e); });
  }
  return next();
}
/* alle benötigten Bilder: Bild-Anhänge + Bilder aus Beschreibung/Kommentaren */
function gatherImages(card, onProgress){
  var byKey = {}, jobs = [], errors = [];
  var attById = {};
  card.attachments.forEach(function(a){ if (a.id) attById['att:' + String(a.id).toLowerCase()] = a; });
  function want(url, att){
    var k = att ? 'att:' + String(att.id).toLowerCase() : imgKey(url);
    if (byKey.hasOwnProperty(k)) return;
    byKey[k] = null;
    jobs.push({ key: k, urls: candidateUrls(att || attById[k], url) });
  }
  card.attachments.forEach(function(a){ if (a.isUpload && isImageAttachment(a)) want(a.url, a); });
  var texts = [card.desc].concat((card.comments || []).map(function(c){ return c.text; }));
  texts.forEach(function(s){
    String(s || '').replace(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g, function(m, u){ want(u, null); return m; });
  });
  if (!jobs.length) return Promise.resolve({ images: byKey, total: 0, errors: errors });

  var idx = 0, done = 0;
  function worker(){
    if (idx >= jobs.length) return Promise.resolve();
    var job = jobs[idx++];
    return loadOneImage(job.urls).then(function(img){ byKey[job.key] = img; }, function(e){ byKey[job.key] = null; errors.push((e && e.message) || 'unbekannt'); })
      .then(function(){ done++; if (onProgress) onProgress(done, jobs.length); return worker(); });
  }
  return Promise.all([worker(), worker(), worker()]).then(function(){ return { images: byKey, total: jobs.length, errors: errors }; });
}

/* ---------- Haupteinstieg aus form.html ---------- */
function exportCardPdf(t, config, data, onProgress){
  var lib, card, imgInfo;
  return Promise.all([loadPdfLib(), collectCardForArchive(t)]).then(function(r){
    lib = r[0]; card = r[1];
    return gatherImages(card, function(d, n){ if (onProgress) onProgress('Lade Bilder ' + d + '/' + n + '…'); });
  }).then(function(res){
    imgInfo = res;
    if (res.errors.length && typeof console !== 'undefined') console.warn('[PDF-Archiv] Bilder nicht geladen:', res.errors);
    if (onProgress) onProgress('Erstelle PDF…');
    return buildArchivePdf(lib, {
      card: card,
      config: config,
      data: data || {},
      images: imgInfo.images,
      fields: { personalien: PERSONALIEN_FIELDS, eckdaten: ECKDATEN_FIELDS, extra: EXTRA_FIELDS },
      exportedAt: new Date()
    });
  }).then(function(bytes){
    var name = archiveFileName(card, data || {});
    downloadBytes(bytes, name);
    return { name: name, imagesTotal: imgInfo.total, imagesMissing: imgInfo.errors.length, reason: imgInfo.errors[0] || '' };
  });
}

function archiveFileName(card, data){
  var d = new Date();
  var stamp = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  var parts = [data.kundennummer, data.nachname, card.name].filter(function(x){ return x && String(x).trim(); });
  var base = parts.join('_') || 'Karte';
  base = base.replace(/[äÄöÖüÜß]/g, function(ch){ return { 'ä':'ae','Ä':'Ae','ö':'oe','Ö':'Oe','ü':'ue','Ü':'Ue','ß':'ss' }[ch]; })
             .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
  return base + '_' + stamp + '.pdf';
}

function downloadBytes(bytes, filename){
  var blob = new Blob([bytes], { type: 'application/pdf' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  try { a.click(); } catch (e) { window.open(url, '_blank'); }
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 4000);
}

function pad2(n){ return (n < 10 ? '0' : '') + n; }

/* =====================================================================
   PDF-Aufbau (unabhängig vom Browser, damit testbar)
   input.images: { schlüssel: {bytes, kind:'jpg'|'png', w, h} | null }
   ===================================================================== */
function buildArchivePdf(lib, input){
  var rgb = lib.rgb;
  function hex(h){ h = h.replace('#', ''); return rgb(parseInt(h.substr(0,2),16)/255, parseInt(h.substr(2,2),16)/255, parseInt(h.substr(4,2),16)/255); }

  var C = {
    ink: hex('#1b2733'), muted: hex('#5a6b7b'), line: hex('#d7dce1'), accent: hex('#1f7a4d'),
    link: hex('#1d5fa8'), white: hex('#ffffff'), soft: hex('#f6f8f9'), codeBg: hex('#f1f3f5')
  };
  var GROUP = {
    green:  { bg:'#eef7f1', border:'#c9e6d5', accent:'#1f7a4d' },
    blue:   { bg:'#eef3fb', border:'#cdddf5', accent:'#2b6cb0' },
    amber:  { bg:'#fdf6ec', border:'#efe0bf', accent:'#b7791f' },
    teal:   { bg:'#ebf7f7', border:'#c3e6e6', accent:'#0f7c86' },
    purple: { bg:'#f4eefb', border:'#ddceef', accent:'#6b46c1' },
    rose:   { bg:'#fdeef1', border:'#f3ccd6', accent:'#b83b5e' },
    gray:   { bg:'#f3f5f7', border:'#dbe1e6', accent:'#55606b' }
  };
  function grp(name){ var g = GROUP[name] || GROUP.gray; return { bg: hex(g.bg), border: hex(g.border), accent: hex(g.accent) }; }
  var LABEL = {
    green:'#4bce97', yellow:'#e2b203', orange:'#faa53d', red:'#f87462', purple:'#9f8fef',
    blue:'#579dff', sky:'#6cc3e0', lime:'#94c748', pink:'#e774bb', black:'#8590a2'
  };
  function labelColor(c){ var base = (c || '').split('_')[0]; return hex(LABEL[base] || '#8590a2'); }
  var BADGE = { pdf:'#d64545', doc:'#2b6cb0', docx:'#2b6cb0', odt:'#2b6cb0', xls:'#1f7a4d', xlsx:'#1f7a4d', csv:'#1f7a4d', ods:'#1f7a4d',
                ppt:'#c55a11', pptx:'#c55a11', zip:'#6b46c1', dwg:'#0f7c86', dxf:'#0f7c86', mp4:'#b83b5e', mov:'#b83b5e' };

  var card = input.card, config = input.config, data = input.data, F = input.fields, imagesIn = input.images || {};

  return lib.PDFDocument.create().then(function(doc){
    var names = ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique', 'Courier'];
    return Promise.all(names.map(function(n){ return doc.embedFont(lib.StandardFonts[n]); })).then(function(fonts){
      // Bilder einbetten
      var keys = Object.keys(imagesIn), emb = {};
      return Promise.all(keys.map(function(k){
        var im = imagesIn[k];
        if (!im || !im.bytes) return null;
        var p = im.kind === 'png' ? doc.embedPng(im.bytes) : doc.embedJpg(im.bytes);
        return p.then(function(e){ emb[k] = e; }, function(){ /* defektes Bild → Platzhalter */ });
      })).then(function(){ return layout(doc, fonts, emb); });
    });
  });

  function layout(doc, fonts, emb){
    var FR = fonts[0], FB = fonts[1], FI = fonts[2], FBI = fonts[3], FC = fonts[4];
    function font(st){ return st.code ? FC : st.b && st.i ? FBI : st.b ? FB : st.i ? FI : FR; }

    doc.setTitle(clean(card.name || 'Karte'));
    doc.setSubject('Trello-Kartenarchiv');
    doc.setCreator('PV-Work-List Power-Up');
    doc.setCreationDate(input.exportedAt);

    var W = 595.28, H = 841.89, ML = 46, MR = 46, TOP = 48, BOTTOM = 790; // y wächst nach unten
    var CW = W - ML - MR;
    var pages = [], P = null, y = 0, box = null;

    function newPage(){ P = { bg: [], fg: [] }; pages.push(P); y = TOP; }
    function ensure(h){
      if (y + h <= BOTTOM) return;
      if (box){ closeSeg(); }
      newPage();
      if (box){ box.segTop = y; y += box.padTop; }
    }
    function closeSeg(){
      P.bg.push({ t: 'box', x: box.x, y: box.segTop, w: box.w, h: (y + box.padBot) - box.segTop, fill: box.fill, border: box.border, r: box.r });
    }
    function openBox(x, w, fill, border, pad, r){
      ensure(pad * 2 + 30);
      box = { x: x, w: w, fill: fill, border: border, padTop: pad, padBot: pad, segTop: y, r: r == null ? 7 : r };
      y += pad;
    }
    function closeBox(){ closeSeg(); y += box.padBot; box = null; }

    function text(x, yTop, s, f, size, color, link){
      P.fg.push({ t: 'text', x: x, y: yTop, s: s, font: f, size: size, color: color, link: link });
    }

    /* --- Text-Hilfen --- */
    function wrap(s, f, size, maxW){
      var out = [];
      clean(s).split('\n').forEach(function(par){
        if (par === ''){ out.push(''); return; }
        var words = par.split(' '), line = '';
        words.forEach(function(w){
          var test = line ? line + ' ' + w : w;
          if (f.widthOfTextAtSize(test, size) <= maxW){ line = test; return; }
          if (line) out.push(line);
          while (f.widthOfTextAtSize(w, size) > maxW){
            var cut = w.length;
            while (cut > 1 && f.widthOfTextAtSize(w.substring(0, cut), size) > maxW) cut--;
            out.push(w.substring(0, cut)); w = w.substring(cut);
          }
          line = w;
        });
        out.push(line);
      });
      return out;
    }

    /* --- Formatierter Text (Runs mit fett/kursiv/Code/Link) --- */
    function richLines(runs, size, maxW){
      var lines = [], cur = [], curW = 0;
      function push(){ // Leerzeichen am Zeilenende entfernen
        while (cur.length && cur[cur.length - 1].space) { curW -= cur[cur.length - 1].w; cur.pop(); }
        lines.push(cur); cur = []; curW = 0;
      }
      runs.forEach(function(r){
        var f = font(r), color = r.link ? C.link : (r.color || C.ink);
        clean(r.text).split(/(\n| +)/).forEach(function(tok){
          if (tok === '') return;
          if (tok === '\n'){ push(); return; }
          var isSpace = /^ +$/.test(tok);
          if (isSpace){ if (!cur.length) return; tok = ' '; }
          var w = f.widthOfTextAtSize(tok, size);
          if (!isSpace && curW + w > maxW && cur.length) push();
          // überlange Wörter zerlegen
          while (!isSpace && w > maxW){
            var cut = tok.length;
            while (cut > 1 && f.widthOfTextAtSize(tok.substring(0, cut), size) > maxW) cut--;
            var part = tok.substring(0, cut);
            cur.push({ s: part, font: f, color: color, link: r.link, w: f.widthOfTextAtSize(part, size), code: r.code });
            push();
            tok = tok.substring(cut); w = f.widthOfTextAtSize(tok, size);
          }
          cur.push({ s: tok, font: f, color: color, link: r.link, w: w, space: isSpace, code: r.code });
          curW += w;
        });
      });
      if (cur.length || !lines.length) push();
      // benachbarte Stücke gleicher Art zusammenfassen
      return lines.map(function(segs){
        var out = [];
        segs.forEach(function(s){
          var last = out[out.length - 1];
          if (last && last.font === s.font && last.color === s.color && last.link === s.link && last.code === s.code){ last.s += s.s; last.w += s.w; }
          else out.push({ s: s.s, font: s.font, color: s.color, link: s.link, w: s.w, code: s.code });
        });
        return out;
      });
    }
    function drawRich(runs, x, w, size, lh){
      lh = lh || size * 1.42;
      richLines(runs, size, w).forEach(function(segs){
        ensure(lh);
        var cx = x;
        segs.forEach(function(sg){
          if (sg.code) P.bg.push({ t: 'rect', x: cx - 1, y: y + 1, w: sg.w + 2, h: size + 3, fill: C.codeBg });
          if (sg.s.trim()) text(cx, y + size, sg.s, sg.font, size, sg.color, sg.link);
          cx += sg.w;
        });
        y += lh;
      });
    }

    /* --- Bild zeichnen (oder Platzhalter) --- */
    function imageBlock(key, url, caption, x, maxW, maxH){
      var im = emb[key];
      if (!im){
        var msg = 'Bild nicht verfügbar' + (caption ? ': ' + caption : '');
        var lines = wrap(msg, FI, 9, maxW - 24);
        var h = 18 + lines.length * 12 + (url ? 12 : 0);
        ensure(h + 6);
        P.bg.push({ t: 'box', x: x, y: y, w: maxW, h: h, fill: C.soft, border: C.line, r: 5 });
        lines.forEach(function(l, i){ text(x + 12, y + 14 + i * 12, l, FI, 9, C.muted); });
        if (url) text(x + 12, y + 14 + lines.length * 12, truncate(clean(url), FR, 8, maxW - 24), FR, 8, C.link, url);
        y += h + 8;
        return;
      }
      var maxPageH = BOTTOM - TOP - 30;
      var s = Math.min(maxW / im.width, Math.min(maxH, maxPageH) / im.height, 1.4);
      var w = im.width * s, h = im.height * s;
      ensure(h + (caption ? 16 : 6));
      P.fg.push({ t: 'img', img: im, x: x, y: y, w: w, h: h, link: url });
      P.fg.push({ t: 'frame', x: x, y: y, w: w, h: h });
      y += h + 4;
      if (caption){ text(x, y + 8, truncate(clean(caption), FI, 8, maxW), FI, 8, C.muted); y += 12; }
      y += 4;
    }

    /* --- Markdown (Trello-Beschreibung / Kommentare) --- */
    function markdown(src, x, w, size){
      var blocks = parseMd(src);
      if (!blocks.length) return;
      blocks.forEach(function(b, bi){
        var gap = bi === 0 ? 0 : 6;
        if (b.type === 'heading'){
          var hs = b.level === 1 ? size + 5 : b.level === 2 ? size + 3 : size + 1;
          ensure(hs * 1.4 + 6 + 20);
          y += gap + 4;
          drawRich(parseInline(b.text, { b: true }), x, w, hs, hs * 1.3);
          y += 1;
        } else if (b.type === 'para'){
          y += gap;
          drawRich(parseInline(b.text, {}), x, w, size);
        } else if (b.type === 'list'){
          y += gap;
          b.items.forEach(function(it){
            var ind = x + it.level * 14;
            var marker = it.ordered ? it.num + '.' : (it.level % 2 ? '–' : '•');
            ensure(size * 1.42);
            text(ind, y + size, marker, it.ordered ? FR : FB, size, C.muted);
            var mw = it.ordered ? Math.max(14, FR.widthOfTextAtSize(marker, size) + 5) : 12;
            drawRich(parseInline(it.text, {}), ind + mw, w - (ind - x) - mw, size);
          });
        } else if (b.type === 'quote'){
          y += gap;
          var qStart = y, qPage = P;
          drawRich(parseInline(b.text, { i: true, color: C.muted }), x + 12, w - 12, size);
          if (qPage === P) P.fg.push({ t: 'line', x1: x + 3, x2: x + 3, y: qStart + 2, y2: y - 2, color: C.line, th: 2.5 });
        } else if (b.type === 'code'){
          y += gap;
          var savedBox = box; box = null;
          openBox(x, w, C.codeBg, C.line, 8, 4);
          b.text.split('\n').forEach(function(l){
            wrap(l === '' ? ' ' : l, FC, size - 1, w - 16).forEach(function(wl){
              ensure(size * 1.3); if (wl.trim()) text(x + 8, y + size - 1, wl, FC, size - 1, C.ink); y += size * 1.3;
            });
          });
          closeBox(); box = savedBox;
        } else if (b.type === 'hr'){
          ensure(14); y += gap + 5;
          P.fg.push({ t: 'line', x1: x, x2: x + w, y: y, color: C.line, th: 0.8 });
          y += 6;
        } else if (b.type === 'image'){
          y += gap;
          imageBlock(imgKey(b.url), b.url, b.alt && !/^image\.(png|jpe?g)$/i.test(b.alt) ? b.alt : '', x, w, 340);
        }
      });
    }

    /* --- Feldraster (Label über Wert) --- */
    function fieldRow(cells, x0, totalW, gap){
      gap = gap == null ? 14 : gap;
      var sum = cells.reduce(function(a, c){ return a + c.ratio; }, 0);
      var avail = totalW - gap * (cells.length - 1);
      var cx = x0, measured = cells.map(function(c){
        var w = avail * c.ratio / sum;
        var val = (c.value == null || String(c.value).trim() === '') ? '–' : String(c.value);
        var lines = c.filler ? [] : wrap(val, FR, 10, w);
        var m = { x: cx, w: w, label: c.label, lines: lines, empty: val === '–' };
        cx += w + gap;
        return m;
      });
      var h = 11 + Math.max(1, Math.max.apply(null, measured.map(function(m){ return m.lines.length; }))) * 13;
      if (h > (BOTTOM - TOP) * 0.6){
        // sehr langer Inhalt: Zelle für Zelle untereinander, zeilenweise mit Seitenumbruch
        measured.forEach(function(m, mi){
          if (cells[mi].filler) return;
          var v = cells[mi].value;
          var full = wrap((v == null || String(v).trim() === '') ? '–' : String(v), FR, 10, totalW);
          ensure(24);
          text(x0, y + 7, clean(m.label).toUpperCase(), FB, 6.6, C.muted);
          y += 11;
          full.forEach(function(l){ ensure(13); text(x0, y + 10, l, FR, 10, C.ink); y += 13; });
          y += 7;
        });
        return;
      }
      ensure(h);
      measured.forEach(function(m){
        text(m.x, y + 7, clean(m.label).toUpperCase(), FB, 6.6, C.muted);
        m.lines.forEach(function(l, i){ text(m.x, y + 11 + 10 + i * 13, l, FR, 10, m.empty ? C.muted : C.ink); });
      });
      y += h + 7;
    }

    function sectionHeading(title, sub, keepWith){
      ensure(44 + (keepWith || 26));
      y += 10;
      text(ML, y + 14, clean(title), FB, 14, C.ink);
      if (sub){ var tw = FB.widthOfTextAtSize(clean(title), 14); text(ML + tw + 8, y + 14, clean(sub), FR, 9, C.muted); }
      y += 20;
      P.fg.push({ t: 'line', x1: ML, x2: ML + CW, y: y, color: C.accent, th: 1.4 });
      y += 10;
    }

    function note(s){ ensure(16); text(ML, y + 10, clean(s), FI, 9.5, C.muted); y += 18; }
    var AUTH_NOTE = 'Nicht enthalten – dafür einmalig die Trello-Freigabe im Karten-Sync erteilen.';

    /* ================= Inhalt ================= */
    newPage();

    // ---- Kopf ----
    var head = clean(config.headings && config.headings.projekt || 'Projektdaten').toUpperCase();
    text(ML, y + 8, head + '  ·  KARTENARCHIV', FB, 7.5, C.accent);
    var archived = 'Archiviert am ' + fmtDateTime(input.exportedAt);
    text(ML + CW - FR.widthOfTextAtSize(archived, 8), y + 8, archived, FR, 8, C.muted);
    y += 18;
    wrap(card.name || 'Ohne Titel', FB, 20, CW).forEach(function(l){ text(ML, y + 19, l, FB, 20, C.ink); y += 25; });
    var where = [card.boardName, card.listName].filter(Boolean).map(clean).join('  ›  ');
    if (where){ text(ML, y + 9, 'Board/Liste:  ' + where, FR, 9.5, C.muted); y += 15; }
    y += 6;

    // ---- Karten-Infos ----
    openBox(ML, CW, C.soft, C.line, 12);
    var ix = ML + 14, iw = CW - 28;
    if (card.labels.length){
      ensure(30);
      text(ix, y + 7, 'LABELS', FB, 6.6, C.muted);
      var lx = ix, ly = y + 11;
      card.labels.forEach(function(lb){
        var nm = clean(lb.name) || ' ';
        var w = Math.max(28, FB.widthOfTextAtSize(nm, 8) + 14);
        if (lx + w > ix + iw){ lx = ix; ly += 18; }
        P.fg.push({ t: 'pill', x: lx, y: ly, w: w, h: 14, fill: labelColor(lb.color) });
        text(lx + 7, ly + 10, nm, FB, 8, C.ink);
        lx += w + 6;
      });
      y = ly + 14 + 9;
    }
    fieldRow([
      { label: 'Mitglieder', value: card.members.map(clean).join(', '), ratio: 2 },
      { label: 'Erstellt', value: card.created ? fmtDate(card.created) : '', ratio: 1 },
      { label: 'Beginn', value: card.start ? fmtDate(card.start) : '', ratio: 1 },
      { label: 'Fällig', value: card.due ? fmtDateTime(card.due) + (card.dueComplete ? '  (erledigt)' : '') : '', ratio: 1.3 }
    ], ix, iw);
    if (card.url){
      ensure(24);
      text(ix, y + 7, 'LINK ZUR KARTE', FB, 6.6, C.muted);
      text(ix, y + 20, clean(card.url), FR, 9, C.link, card.url);
      y += 26;
    }
    y -= 7;
    closeBox();

    // ---- Power-Up-Blöcke ----
    var bx = ML, bw = CW, ip = 14;

    sectionHeading(config.headings && config.headings.personalien || 'Personalien');
    var pc = grp(config.personalien && config.personalien.color);
    openBox(bx, bw, pc.bg, pc.border, 12);
    for (var i = 0; i < F.personalien.length; i += 2){
      var cells = [];
      [F.personalien[i], F.personalien[i + 1]].forEach(function(f){ if (!f) return;
        cells.push({ label: f.label, value: data[f.key], ratio: f.width === 'w75' ? 3 : f.width === 'w25' ? 1 : 2 });
      });
      fieldRow(cells, bx + ip, bw - ip * 2);
    }
    y -= 7; closeBox();

    sectionHeading(config.headings && config.headings.eckdaten || 'Eckdaten');
    var ec = grp((config.eckdaten && config.eckdaten.color) || 'teal');
    openBox(bx, bw, ec.bg, ec.border, 12);
    var k = 0;
    while (k < F.eckdaten.length){
      var wd = F.eckdaten[k].width, cap = wd === 25 ? 4 : wd === 33 ? 3 : wd === 50 ? 2 : 1, row = [];
      while (k < F.eckdaten.length && F.eckdaten[k].width === wd && row.length < cap){
        row.push({ label: F.eckdaten[k].label, value: data[F.eckdaten[k].key], ratio: 1 }); k++;
      }
      while (row.length < cap) row.push({ label: '', value: '', ratio: 1, filler: true });
      fieldRow(row, bx + ip, bw - ip * 2);
    }
    y -= 7; closeBox();

    sectionHeading(config.headings && config.headings.planung || 'Planung');
    (config.groups || []).forEach(function(g){
      var gc = grp(g.color);
      var filled = g.rows.filter(function(r){
        var v = data[r.key], n = data[r.key + '_anzahl'];
        return (v && String(v).trim()) || (n != null && String(n).trim() !== '');
      });
      ensure(56);
      openBox(bx, bw, gc.bg, gc.border, 10);
      ensure(18);
      text(bx + ip, y + 11, clean(g.title), FB, 11, gc.accent);
      y += 19;
      if (!filled.length){ text(bx + ip, y + 9, 'Keine Angaben', FI, 9.5, C.muted); y += 14; }
      filled.forEach(function(r){
        fieldRow([
          { label: r.label, value: data[r.key], ratio: 2.1 },
          { label: r.countLabel, value: data[r.key + '_anzahl'], ratio: 1 }
        ], bx + ip, bw - ip * 2);
      });
      if (filled.length) y -= 7;
      closeBox();
      y += 8;
    });

    if (F.extra && F.extra.length){
      ensure(60);
      openBox(bx, bw, C.white, C.line, 12);
      F.extra.forEach(function(f){
        fieldRow([{ label: String(f.label).replace(/:\s*$/, ''), value: data[f.key], ratio: 1 }], bx + ip, bw - ip * 2);
      });
      y -= 7; closeBox();
    }

    // ---- Beschreibung (formatiert, mit Bildern) ----
    sectionHeading('Beschreibung');
    if (card.desc && card.desc.trim()) markdown(card.desc, ML, CW, 10);
    else note('Keine Beschreibung.');

    // ---- Anhänge: Bilder als Galerie, Rest als Links ----
    var inDesc = {};
    String(card.desc || '').replace(/\/attachments\/([a-f0-9]{24})/gi, function(m, id){ inDesc[id.toLowerCase()] = true; return m; });
    var imgs = card.attachments.filter(function(a){ return a.isUpload && isImageAttachment(a); });
    var files = card.attachments.filter(function(a){ return !(a.isUpload && isImageAttachment(a)); });
    var galleryImgs = imgs.filter(function(a){ return !inDesc[String(a.id || '').toLowerCase()]; });

    if (galleryImgs.length){
      var extra = imgs.length - galleryImgs.length;
      var colGap = 14, colW = (CW - colGap) / 2, maxImgH = 250;
      var firstH = Math.max.apply(null, galleryImgs.slice(0, 2).map(function(a){
        var im = emb['att:' + String(a.id || '').toLowerCase()];
        return im ? im.height * Math.min(colW / im.width, maxImgH / im.height) : 90;
      })) + 30;
      sectionHeading('Bilder', '(' + galleryImgs.length + (extra ? ', ' + extra + ' weitere in der Beschreibung' : '') + ')', firstH + (card.authMissing ? 18 : 0));
      if (card.authMissing) note('Bilder konnten nicht geladen werden – dafür einmalig die Trello-Freigabe im Karten-Sync erteilen.');
      for (var gi = 0; gi < galleryImgs.length; gi += 2){
        var pair = galleryImgs.slice(gi, gi + 2).map(function(a){
          var key = 'att:' + String(a.id || '').toLowerCase();
          var im = emb[key] || emb[imgKey(a.url)];
          var h = im ? im.height * Math.min(colW / im.width, maxImgH / im.height) : 90;
          return { a: a, im: im, h: h };
        });
        var rowH = Math.max.apply(null, pair.map(function(p){ return p.h; })) + 30;
        ensure(rowH);
        pair.forEach(function(p, pi){
          var x = ML + pi * (colW + colGap);
          if (p.im){
            var s = Math.min(colW / p.im.width, maxImgH / p.im.height);
            var w = p.im.width * s, h = p.im.height * s;
            P.fg.push({ t: 'img', img: p.im, x: x, y: y, w: w, h: h, link: p.a.url });
            P.fg.push({ t: 'frame', x: x, y: y, w: w, h: h });
            text(x, y + h + 11, truncate(clean(p.a.name), FB, 8.5, colW), FB, 8.5, C.ink, p.a.url);
            if (p.a.date) text(x, y + h + 22, 'Hinzugefügt ' + fmtDateTime(p.a.date), FR, 7.5, C.muted);
          } else {
            P.bg.push({ t: 'box', x: x, y: y, w: colW, h: 90, fill: C.soft, border: C.line, r: 5 });
            var msg = wrap('Bild nicht verfügbar – im Original öffnen', FI, 8.5, colW - 20);
            msg.forEach(function(l, li){ text(x + 10, y + 40 + li * 11, l, FI, 8.5, C.muted); });
            text(x, y + 90 + 11, truncate(clean(p.a.name), FB, 8.5, colW), FB, 8.5, C.link, p.a.url);
            if (p.a.date) text(x, y + 90 + 22, 'Hinzugefügt ' + fmtDateTime(p.a.date), FR, 7.5, C.muted);
          }
        });
        y += rowH + 6;
      }
    }

    sectionHeading('Dateien & Links', '(' + files.length + ')');
    if (!files.length) note('Keine weiteren Anhänge.');
    files.forEach(function(a){
      var ext = a.isUpload ? (fileExt(a.name, a.url) || 'datei') : 'link';
      var badge = ext.toUpperCase().substring(0, 4);
      var bc = hex(a.isUpload ? (BADGE[ext] || '#55606b') : '#8590a2');
      var tx = ML + 44, tw = CW - 44;
      var nameLines = wrap(a.name || 'Anhang', FB, 10, tw);
      var hRow = nameLines.length * 13 + 24;
      ensure(hRow + 4);
      P.fg.push({ t: 'pill', x: ML, y: y + 1, w: 36, h: 18, fill: bc, r: 4, link: a.url });
      var bwid = FB.widthOfTextAtSize(badge, 7.5);
      text(ML + 18 - bwid / 2, y + 13, badge, FB, 7.5, C.white);
      nameLines.forEach(function(l, li){ text(tx, y + 11 + li * 13, l, FB, 10, C.link, a.url); });
      var yy = y + 11 + nameLines.length * 13;
      var meta = [a.date ? 'Hinzugefügt ' + fmtDateTime(a.date) : '', a.bytes ? fmtBytes(a.bytes) : ''].filter(Boolean).join('  ·  ');
      if (meta) text(tx, yy, meta, FR, 7.5, C.muted);
      text(tx, yy + 10, truncate(clean(a.url || ''), FR, 7.5, tw), FR, 7.5, C.muted, a.url);
      y += hRow + 6;
    });

    // ---- Checklisten ----
    sectionHeading('Checklisten');
    if (card.checklists === null){
      note(AUTH_NOTE);
    } else if (!card.checklists.length){
      note('Keine Checklisten.');
    } else {
      card.checklists.forEach(function(cl){
        var done = cl.items.filter(function(it){ return it.done; }).length;
        ensure(34);
        text(ML, y + 11, clean(cl.name), FB, 11, C.ink);
        text(ML + FB.widthOfTextAtSize(clean(cl.name), 11) + 8, y + 11, done + '/' + cl.items.length + ' erledigt', FR, 8.5, C.muted);
        y += 18;
        cl.items.forEach(function(it){
          var lines = wrap(it.name, FR, 10, CW - 20);
          ensure(lines.length * 13 + 4);
          P.fg.push({ t: 'check', x: ML + 1, y: y + 2, s: 9, done: it.done });
          lines.forEach(function(l, n){ text(ML + 18, y + 10 + n * 13, l, FR, 10, it.done ? C.muted : C.ink); });
          y += lines.length * 13 + 4;
        });
        y += 8;
      });
    }

    // ---- Kommentare (formatiert, mit Bildern) ----
    sectionHeading('Kommentare', card.comments ? '(' + card.comments.length + ')' : '');
    if (card.comments === null){
      note(AUTH_NOTE);
    } else if (!card.comments.length){
      note('Keine Kommentare.');
    } else {
      card.comments.forEach(function(cm){
        ensure(40);
        text(ML, y + 10, clean(cm.author), FB, 10, C.ink);
        text(ML + FB.widthOfTextAtSize(clean(cm.author), 10) + 8, y + 10, fmtDateTime(cm.date), FR, 8.5, C.muted);
        y += 16;
        var startY = y, startPage = P;
        markdown(cm.text, ML + 10, CW - 10, 9.5);
        if (startPage === P) P.fg.push({ t: 'line', x1: ML + 2, x2: ML + 2, y: startY, y2: y - 3, color: C.line, th: 2 });
        y += 10;
      });
    }

    /* ================= Zeichnen ================= */
    var total = pages.length;
    pages.forEach(function(pg, idx){
      var page = doc.addPage([W, H]);
      pg.bg.forEach(function(o){
        if (o.t === 'box') page.drawSvgPath(roundRect(o.w, o.h, o.r == null ? 7 : o.r), { x: o.x, y: H - o.y, color: o.fill, borderColor: o.border, borderWidth: 0.8 });
        else if (o.t === 'rect') page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: o.fill });
      });
      pg.fg.forEach(function(o){
        if (o.t === 'text'){
          page.drawText(o.s, { x: o.x, y: H - o.y, size: o.size, font: o.font, color: o.color });
          if (o.link) addLink(lib, page, o.x, H - o.y - 2, o.font.widthOfTextAtSize(o.s, o.size), o.size + 3, o.link);
        } else if (o.t === 'img'){
          page.drawImage(o.img, { x: o.x, y: H - o.y - o.h, width: o.w, height: o.h });
          if (o.link) addLink(lib, page, o.x, H - o.y - o.h, o.w, o.h, o.link);
        } else if (o.t === 'frame'){
          page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, borderColor: C.line, borderWidth: 0.6 });
        } else if (o.t === 'line'){
          page.drawLine({ start: { x: o.x1, y: H - o.y }, end: { x: o.x2, y: H - (o.y2 != null ? o.y2 : o.y) }, thickness: o.th, color: o.color });
        } else if (o.t === 'pill'){
          page.drawSvgPath(roundRect(o.w, o.h, o.r == null ? 7 : o.r), { x: o.x, y: H - o.y, color: o.fill });
          if (o.link) addLink(lib, page, o.x, H - o.y - o.h, o.w, o.h, o.link);
        } else if (o.t === 'check'){
          page.drawRectangle({ x: o.x, y: H - o.y - o.s, width: o.s, height: o.s, borderColor: o.done ? C.accent : C.muted, borderWidth: 0.9, color: o.done ? C.accent : C.white });
          if (o.done){
            var bx0 = o.x, by0 = H - o.y - o.s;
            page.drawLine({ start: { x: bx0 + 2, y: by0 + 4.6 }, end: { x: bx0 + 3.9, y: by0 + 2.4 }, thickness: 1.3, color: C.white });
            page.drawLine({ start: { x: bx0 + 3.9, y: by0 + 2.4 }, end: { x: bx0 + 7.2, y: by0 + 7 }, thickness: 1.3, color: C.white });
          }
        }
      });
      page.drawLine({ start: { x: ML, y: 38 }, end: { x: W - MR, y: 38 }, thickness: 0.5, color: C.line });
      page.drawText(truncate(clean(card.name || ''), FR, 7.5, CW - 90), { x: ML, y: 26, size: 7.5, font: FR, color: C.muted });
      var pn = 'Seite ' + (idx + 1) + ' von ' + total;
      page.drawText(pn, { x: W - MR - FR.widthOfTextAtSize(pn, 7.5), y: 26, size: 7.5, font: FR, color: C.muted });
    });

    return doc.save();
  }
}

/* ---------- Markdown-Parser (das, was Trello in Beschreibungen nutzt) ---------- */
function parseMd(src){
  src = String(src || '').replace(/\r\n?/g, '\n')
    // eingebettete Bilder auf eigene Zeile, damit sie als Bildblock erscheinen
    .replace(/[ \t]*(!\[[^\]]*\]\([^)]*\))[ \t]*/g, '\n\n$1\n\n');
  var L = src.split('\n'), out = [], i = 0;
  var reList = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var reHead = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var reHr = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  var reImg = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)\s*$/;
  function isBlockStart(l){ return reHead.test(l) || reHr.test(l) || /^\s*```/.test(l) || /^\s*>/.test(l) || reList.test(l) || reImg.test(l); }
  while (i < L.length){
    var l = L[i];
    if (/^\s*$/.test(l)){ i++; continue; }
    if (/^\s*```/.test(l)){
      var code = []; i++;
      while (i < L.length && !/^\s*```/.test(L[i])){ code.push(L[i]); i++; }
      i++; out.push({ type: 'code', text: code.join('\n') }); continue;
    }
    var m;
    if ((m = l.match(reImg))){ out.push({ type: 'image', alt: m[1], url: m[2] }); i++; continue; }
    if ((m = l.match(reHead))){ out.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue; }
    if (reHr.test(l)){ out.push({ type: 'hr' }); i++; continue; }
    if (/^\s*>/.test(l)){
      var q = [];
      while (i < L.length && /^\s*>/.test(L[i])){ q.push(L[i].replace(/^\s*>\s?/, '')); i++; }
      out.push({ type: 'quote', text: q.join('\n') }); continue;
    }
    if (reList.test(l)){
      var items = [];
      while (i < L.length){
        var lm = L[i].match(reList);
        if (lm){
          var ord = /\d/.test(lm[2]);
          items.push({ level: Math.min(4, Math.floor(lm[1].replace(/\t/g, '    ').length / 2)), ordered: ord, num: ord ? parseInt(lm[2], 10) : 0, text: lm[3] });
          i++;
        } else if (/^\s+\S/.test(L[i]) && items.length && !isBlockStart(L[i])){
          items[items.length - 1].text += ' ' + L[i].trim(); i++;
        } else break;
      }
      out.push({ type: 'list', items: items }); continue;
    }
    var p = [];
    while (i < L.length && !/^\s*$/.test(L[i]) && !(p.length && isBlockStart(L[i]))){ p.push(L[i].replace(/\s+$/, '')); i++; }
    out.push({ type: 'para', text: p.join('\n') });
  }
  return out;
}

/* Inline: **fett**, *kursiv*, ~~durch~~, `code`, [Text](url), nackte URLs */
function parseInline(s, st){
  st = st || {};
  var runs = [];
  var re = /(\*\*|__)(?=\S)([\s\S]+?)(?:\S)?\1|~~([\s\S]+?)~~|`([^`]+)`|\[([^\]]+)\]\(\s*<?([^)\s>]+)>?[^)]*\)|(https?:\/\/[^\s<>()\]]*[^\s<>()\].,;:!?'"])|(^|[^\w*\\])([*_])(?![*_\s])([\s\S]*?[^\s*_])\9(?![\w*])/;
  function ext(o){ var r = {}; for (var k in st) r[k] = st[k]; for (var k2 in o) r[k2] = o[k2]; return r; }
  var guard = 0;
  while (s && guard++ < 2000){
    var m = re.exec(s);
    if (!m){ runs.push(ext({ text: unesc(s) })); break; }
    if (m.index > 0) runs.push(ext({ text: unesc(s.slice(0, m.index)) }));
    if (m[1]){
      var inner = m[0].slice(m[1].length, m[0].length - m[1].length);
      runs = runs.concat(parseInline(inner, ext({ b: true })));
    } else if (m[3] != null){
      runs = runs.concat(parseInline(m[3], ext({})));
    } else if (m[4] != null){
      runs.push(ext({ text: m[4], code: true }));
    } else if (m[5] != null){
      runs = runs.concat(parseInline(m[5], ext({ link: m[6] })));
    } else if (m[7] != null){
      runs.push(ext({ text: m[7], link: m[7] }));
    } else if (m[9]){
      if (m[8]) runs.push(ext({ text: m[8] }));
      runs = runs.concat(parseInline(m[10], ext({ i: true })));
    }
    s = s.slice(m.index + m[0].length);
  }
  return runs;
}
function unesc(s){ return s.replace(/\\([\\`*_{}\[\]()#+\-.!~>])/g, '$1'); }

/* ---------- kleine Helfer ---------- */
function roundRect(w, h, r){
  r = Math.min(r, w / 2, h / 2);
  return 'M ' + r + ' 0 L ' + (w - r) + ' 0 Q ' + w + ' 0 ' + w + ' ' + r +
         ' L ' + w + ' ' + (h - r) + ' Q ' + w + ' ' + h + ' ' + (w - r) + ' ' + h +
         ' L ' + r + ' ' + h + ' Q 0 ' + h + ' 0 ' + (h - r) + ' L 0 ' + r + ' Q 0 0 ' + r + ' 0 Z';
}

function addLink(lib, page, x, y, w, h, url){
  try {
    var ctx = page.doc.context;
    var annot = ctx.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: lib.PDFString.of(url) }
    });
    page.node.addAnnot(ctx.register(annot));
  } catch (e) { /* Link optional */ }
}

function truncate(s, f, size, maxW){
  if (f.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && f.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '…';
}

/* Standard-PDF-Schriften kennen nur den Windows-1252-Zeichensatz:
   Umlaute, ß, €, „“ usw. gehen – Emojis und Sonderzeichen werden ersetzt. */
var WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
var REPLACE = { '→':'->', '←':'<-', '⇒':'=>', '✓':'x', '✔':'x', '✗':'x', '✘':'x', '≈':'~', '≤':'<=', '≥':'>=', '−':'-', ' ':' ', ' ':' ', '​':'' };
function clean(s){
  s = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  var out = '';
  for (var i = 0; i < s.length; i++){
    var ch = s[i], code = s.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF){ i++; continue; } // Emojis u. Ä.
    if (ch === '\n' || (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || WINANSI_EXTRA.indexOf(ch) > -1){ out += ch; continue; }
    if (REPLACE.hasOwnProperty(ch)){ out += REPLACE[ch]; continue; }
    if (code === 0xFE0F || code === 0x200D) continue;
    out += '?';
  }
  return out;
}

function fmtBytes(b){ return b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
function fmtDate(d){ d = new Date(d); return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear(); }
function fmtDateTime(d){ d = new Date(d); return fmtDate(d) + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' Uhr'; }

if (typeof module !== 'undefined' && module.exports){
  module.exports = { buildArchivePdf: buildArchivePdf, archiveFileName: archiveFileName, parseMd: parseMd, parseInline: parseInline, imgKey: imgKey, clean: clean };
}
