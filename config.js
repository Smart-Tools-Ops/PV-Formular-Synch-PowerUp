/* Gemeinsame Konfiguration + Speicher-Helfer.
   Struktur (Überschriften, Bezeichnungen, Farben, Dropdown-Optionen) wird
   boardweit gespeichert. Die ausgefüllten Werte liegen pro Karte. */

/* ====== HIER DEINEN TRELLO-API-KEY EINTRAGEN ======
   Findest du im Power-Up-Admin unter "API-Schlüssel". Nur der KEY, nicht das Secret.
   Ohne diesen Key funktioniert die Kartensynchronisation nicht. */
var APP_KEY = '26a3994fa7cc750f04e2740df9ff646c';

var PALETTE = ['green','blue','amber','teal','purple','rose','gray'];

var DEFAULT_CONFIG = {
  headings: { projekt:'Projektdaten', personalien:'Personalien', planung:'Planung' },
  personalien: { color:'gray', anrede:['Herr','Frau','Familie'] },
  /* catalog = Name der Liste in produkte.js, aus der das Dropdown befüllt wird.
     Die Schlüssel (key) NIE ändern – unter ihnen sind die Werte in den Karten gespeichert. */
  groups: [
    { key:'pv',       title:'PV-Module',        color:'green',  rows:[
        { key:'modultyp',       label:'Modultyp',                          countLabel:'Anzahl Module',               catalog:'module' },
        { key:'modultyp2',      label:'Modultyp 2 (z. B. Carport)',        countLabel:'Anzahl Module',               catalog:'module' } ]},
    { key:'wr',       title:'Wechselrichter',   color:'blue',   rows:[
        { key:'wechselrichter', label:'Wechselrichter',                    countLabel:'Anzahl Wechselrichter',       catalog:'wechselrichter' },
        { key:'wechselrichter2',label:'Wechselrichter 2 (z. B. Mikro-WR Balkonkraftwerk)', countLabel:'Anzahl Wechselrichter', catalog:'wechselrichter' } ]},
    { key:'speicher', title:'Stromspeicher',    color:'amber',  rows:[
        { key:'bms',            label:'BMS',                               countLabel:'Anzahl BMS',                  catalog:'bms' },
        { key:'stromspeicher',  label:'Batteriemodul (Akkublöcke)',        countLabel:'Anzahl Batteriemodule',       catalog:'batteriemodul' } ]},
    { key:'wallbox',  title:'Wallbox',          color:'teal',   rows:[
        { key:'wallbox',        label:'Wallbox',                           countLabel:'Anzahl Wallboxen',            catalog:'wallbox' },
        { key:'wallbox_standfuss', label:'Wallbox-Standfuß',               countLabel:'Anzahl Standfüße',            catalog:'standfuss' } ]},
    { key:'uk',       title:'Unterkonstruktion',color:'purple', rows:[
        { key:'uk_schiene',     label:'Schienen',                          countLabel:'Anzahl Schienen',             catalog:'schienen' },
        { key:'uk_haken',       label:'Haken',                             countLabel:'Anzahl Haken',                catalog:'haken' },
        { key:'uk_zusatz',      label:'Unterkonstruktion 2 (z. B. Carport)', countLabel:'Anzahl',                    catalog:'schienen' } ]},
    { key:'zusaetze', title:'Zusätze',          color:'rose',   rows:[
        { key:'esp',     label:'EPS / Notstrombox', countLabel:'Anzahl ESP / Notstromboxen', catalog:'eps' },
        { key:'zusatz1', label:'Zusatzprodukt 1',   countLabel:'Anzahl', catalog:'zubehoer' },
        { key:'zusatz2', label:'Zusatzprodukt 2',   countLabel:'Anzahl', catalog:'zubehoer' },
        { key:'zusatz3', label:'Zusatzprodukt 3',   countLabel:'Anzahl', catalog:'zubehoer' },
        { key:'zusatz4', label:'Zusatzprodukt 4',   countLabel:'Anzahl', catalog:'zubehoer' },
        { key:'zusatz5', label:'Zusatzprodukt 5',   countLabel:'Anzahl', catalog:'zubehoer' } ]}
  ]
};

/* Bezeichnungen der ersten Version – nur zum Erkennen, ob eine gespeicherte
   Bezeichnung selbst umbenannt wurde (dann bleibt sie) oder noch Standard ist. */
var OLD_DEFAULT_LABELS = { stromspeicher:'Stromspeicher' };

/* Feste Personalien-Felder (Reihenfolge = Anzeige). "anrede" ist ein Dropdown. */
var PERSONALIEN_FIELDS = [
  { key:'kundennummer', label:'Kundennummer', type:'text',   width:'half' },
  { key:'anrede',       label:'Anrede',       type:'anrede', width:'half' },
  { key:'vorname',      label:'Vorname',      type:'text',   width:'half' },
  { key:'nachname',     label:'Nachname',     type:'text',   width:'half' },
  { key:'telefon',      label:'Telefonnummer',type:'tel',    width:'half' },
  { key:'email',        label:'Email',        type:'email',  width:'half' },
  { key:'strasse',      label:'Straße',       type:'text',   width:'w75' },
  { key:'hausnummer',   label:'Hausnr.',      type:'text',   width:'w25' },
  { key:'plz',          label:'PLZ',          type:'text',   width:'w25' },
  { key:'stadt',        label:'Stadt',        type:'text',   width:'w75' }
];

/* Eckdaten-Box zwischen Personalien und Planung. Reine Textfelder, eigene Schlüssel.
   width: 25 | 33 | 50 | 100 (Prozent) – bestimmt, wie viele Felder pro Zeile stehen. */
var ECKDATEN_FIELDS = [
  { key:'sparrenstaerke',       label:'Sparrenstärke',                width:25 },
  { key:'sparrenabstand',       label:'Sparrenabstand',               width:25 },
  { key:'ersatz_dachziegel',    label:'Ersatz Dachziegel',            width:25 },
  { key:'ziegelmasse',          label:'Ziegelmaße',                   width:25 },
  { key:'ziegelart',            label:'Ziegelart',                    width:33 },
  { key:'zweite_ebene',         label:'Zweite wasserführende Ebene',  width:33 },
  { key:'dachneigung',          label:'Dachneigung',                  width:25 },
  { key:'hausmasse',            label:'Hausmaße',                     width:25 },
  { key:'strompreis',           label:'Strompreis',                   width:33 },
  { key:'netzbetreiber',        label:'Netzbetreiber',                width:33 },
  { key:'jahresverbrauch',      label:'Jahres Verbrauch',             width:33 },
  { key:'waermepumpenverbrauch',label:'Wärmepumpenverbrauch',         width:33 },
  { key:'eck_schaltschrank',    label:'Schaltschrank',                width:50 },
  { key:'zukunftsplaene',       label:'Zukunftspläne',                width:50 },
  { key:'kabelwege',            label:'Kabelwege',                    width:100 },
  { key:'zusaetzliches',        label:'Zusätzliches',                 width:100 }
];

/* Zusatzfelder unter dem Formular – NICHT im CSV-Export enthalten. */
var EXTRA_FIELDS = [
  { key:'abstand_wr_ssk', label:'Abstand Wechselrichter – Schaltschrank:', type:'text' },
  { key:'schaltschrank',  label:'Schaltschrank',                            type:'textarea' }
];

function clone(o){ return JSON.parse(JSON.stringify(o)); }

/* ---------- Produktnamen vergleichen (Schreibweisen ignorieren) ---------- */
function normName(s){
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
    .replace(/\bmm\b/g, '')
    .replace(/,/g, '.')
    .replace(/[–—\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(\d) (?=\d{3}\b)/g, '$1')     // Tausenderlücke „1 134“ -> „1134“
    .replace(/\b\d{3,4} ?x ?\d{3,4}\b/g, '')    // Modulgröße zählt beim Vergleich nicht
    .replace(/\s+/g, ' ')
    .trim();
}
function sameName(a, b){ return normName(a) === normName(b); }
function isHeader(s){ return /^##\s/.test(String(s)); }
function catalogList(name){
  return (typeof PRODUKT_KATALOG !== 'undefined' && name && PRODUKT_KATALOG[name]) ? PRODUKT_KATALOG[name].slice() : [];
}
/* Dropdown einer Zeile, gruppiert: [{label, items}] – Produktliste ohne
   ausgeblendete Einträge, dazu eigene Ergänzungen */
function rowOptionGroups(r){
  var groups = [], cur = { label:'', items:[] }, seen = [];
  function take(o){ if (seen.some(function(x){ return sameName(x, o); })) return false; seen.push(o); return true; }
  catalogList(r.catalog).forEach(function(o){
    if (isHeader(o)){ if (cur.items.length) groups.push(cur); cur = { label:String(o).replace(/^##\s*/, ''), items:[] }; return; }
    if ((r.hide || []).some(function(h){ return sameName(h, o); })) return;
    if (take(o)) cur.items.push(o);
  });
  if (cur.items.length) groups.push(cur);
  var own = (r.add || []).filter(function(o){ return o && take(o); });
  if (own.length) groups.push({ label: groups.length ? 'Eigene Ergänzungen' : '', items: own });
  return groups;
}
function rowOptions(r){
  var out = []; rowOptionGroups(r).forEach(function(g){ out = out.concat(g.items); }); return out;
}

/* ---------- Konfiguration laden / speichern ----------
   Trello erlaubt pro Board nur 4096 Zeichen Speicher. Deshalb wird nur
   gespeichert, was im Backend vom Standard abweicht (Überschriften, Farben,
   Bezeichnungen, eigene Ergänzungen, ausgeblendete Produkte). */
var CONFIG_LIMIT = 4096;

function expandConfig(stored){
  var c = clone(DEFAULT_CONFIG);
  c.eckdaten = { color:'teal' };
  var byRow = {}, byGroup = {};
  c.groups.forEach(function(g){ byGroup[g.key] = g; g.rows.forEach(function(r){ byRow[r.key] = r; r.add = []; r.hide = []; }); });

  if (stored && stored.v === 2){
    if (stored.headings) Object.keys(stored.headings).forEach(function(k){ c.headings[k] = stored.headings[k]; });
    if (stored.personalien) { if (stored.personalien.color) c.personalien.color = stored.personalien.color;
                              if (stored.personalien.anrede) c.personalien.anrede = stored.personalien.anrede; }
    if (stored.eckdaten && stored.eckdaten.color) c.eckdaten.color = stored.eckdaten.color;
    Object.keys(stored.g || {}).forEach(function(k){ var g = byGroup[k], s = stored.g[k]; if (!g) return;
      if (s.t) g.title = s.t; if (s.c) g.color = s.c; });
    Object.keys(stored.r || {}).forEach(function(k){ var r = byRow[k], s = stored.r[k]; if (!r) return;
      if (s.l) r.label = s.l; if (s.cl) r.countLabel = s.cl;
      r.add = s.add || []; r.hide = s.hide || []; });
  } else if (stored && stored.groups){
    // Alte Speicherform (erste Version): alles übernehmen, alte Optionen werden eigene Ergänzungen
    if (stored.headings) Object.keys(stored.headings).forEach(function(k){ c.headings[k] = stored.headings[k]; });
    if (stored.personalien) { if (stored.personalien.color) c.personalien.color = stored.personalien.color;
                              if (stored.personalien.anrede) c.personalien.anrede = stored.personalien.anrede; }
    if (stored.eckdaten && stored.eckdaten.color) c.eckdaten.color = stored.eckdaten.color;
    stored.groups.forEach(function(sg){
      var g = byGroup[sg.key];
      if (g){ if (sg.title) g.title = sg.title; if (sg.color) g.color = sg.color; }
      (sg.rows || []).forEach(function(sr){
        var r = byRow[sr.key]; if (!r) return;
        var oldDefault = OLD_DEFAULT_LABELS[sr.key];
        if (sr.label && sr.label !== (oldDefault || r.label)) r.label = sr.label;
        r.add = (sr.options || []).filter(function(o){ return !catalogList(r.catalog).some(function(x){ return !isHeader(x) && sameName(x, o); }); });
      });
    });
  }
  c.groups.forEach(function(g){ g.rows.forEach(function(r){ r.options = rowOptions(r); }); });
  return c;
}

function compactConfig(c){
  var d = clone(DEFAULT_CONFIG), out = { v:2, headings:c.headings, g:{}, r:{} };
  if (c.personalien) out.personalien = { color:c.personalien.color, anrede:c.personalien.anrede };
  if (c.eckdaten && c.eckdaten.color && c.eckdaten.color !== 'teal') out.eckdaten = { color:c.eckdaten.color };
  var dRow = {}, dGroup = {};
  d.groups.forEach(function(g){ dGroup[g.key] = g; g.rows.forEach(function(r){ dRow[r.key] = r; }); });
  (c.groups || []).forEach(function(g){
    var dg = dGroup[g.key]; if (!dg) return;
    var s = {}; if (g.title !== dg.title) s.t = g.title; if (g.color !== dg.color) s.c = g.color;
    if (s.t || s.c) out.g[g.key] = s;
    g.rows.forEach(function(r){
      var dr = dRow[r.key]; if (!dr) return;
      var x = {};
      if (r.label !== dr.label) x.l = r.label;
      if (r.countLabel !== dr.countLabel) x.cl = r.countLabel;
      if (r.add && r.add.length) x.add = r.add;
      if (r.hide && r.hide.length) x.hide = r.hide;
      if (Object.keys(x).length) out.r[r.key] = x;
    });
  });
  return out;
}
function configSize(c){ return JSON.stringify(compactConfig(c)).length; }

function loadConfig(t){
  return t.get('board','shared','config').then(expandConfig);
}
function saveConfig(t, c){
  var compact = compactConfig(c);
  if (JSON.stringify(compact).length > CONFIG_LIMIT)
    return Promise.reject(new Error('Zu viele eigene Einträge – bitte in produkte.js eintragen'));
  return t.set('board','shared','config', compact);
}

function loadCardData(t){
  return t.get('card','shared','projektdaten').then(function(d){ return d || {}; });
}
function saveCardData(t, d){ return t.set('card','shared','projektdaten', d); }
