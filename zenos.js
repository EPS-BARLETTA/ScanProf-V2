// zenos.js — Groupes ZENOS : 1H + 2M + 1B, mixité stricte si possible.
// Suggestions d’échanges (même rôle) avec boutons “Appliquer” et “Tout appliquer”.

// État courant (sert aux exports et aux swaps)
window._zenosGroupes = [];
window._zenosRestants = [];
window._zenosChoixClasse = "__TOUS__";

document.addEventListener("DOMContentLoaded", function () {
  const all = safeParse(localStorage.getItem("eleves")) || [];
  for (const e of all) if (e) e.classe = canonClasse(e.classe || e.Classe || "");

  // Remplit le select des classes
  const select = document.getElementById("classe-select");
  if (select) {
    const optTous = document.createElement("option");
    optTous.value = "__TOUS__";
    optTous.textContent = "Tous (classe ignorée)";
    select.appendChild(optTous);

    const classes = uniqueClasses(all).sort();
    for (const c of classes) {
      const op = document.createElement("option");
      op.value = c; op.textContent = c;
      select.appendChild(op);
    }
  }

  const btn = document.getElementById("btn-generer-zenos");
  if (btn) btn.addEventListener("click", genererGroupesZenos);

  const titre = document.getElementById("titre-classe");
  if (select && uniqueClasses(all).length === 1) {
    select.value = uniqueClasses(all)[0];
    if (titre) titre.textContent = "Classe " + select.value;
    genererGroupesZenos();
  } else if (titre) {
    titre.textContent = "Tous (classe ignorée)";
  }
});

// ===== Helpers =====
function safeParse(t){ try{ return JSON.parse(t||"[]"); } catch(e){ return []; } }

// "5ème A", "5emeA", "5 a", "5a" → "5A"
function canonClasse(raw){
  if(!raw) return "";
  let s = String(raw).toUpperCase();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");  // accents
  s = s.replace(/EME|ÈME/g,"");                           // EME
  s = s.replace(/[^A-Z0-9]/g,"");                         // suppr espaces/points
  const m = s.match(/^(\d{1,2})([A-Z])$/);
  return m ? (m[1]+m[2]) : s;
}
function uniqueClasses(arr){
  const set = new Set();
  for(const e of arr){ if(e && e.classe) set.add(e.classe); }
  return Array.from(set);
}
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function appendCell(tr, val){ const td=document.createElement("td"); td.textContent=val==null?"":String(val); tr.appendChild(td); }
function normSexe(s){
  const x = String(s||"").trim().toUpperCase();
  if (x.startsWith("F")) return "F";
  if (x.startsWith("G") || x.startsWith("M")) return "G";
  return "X";
}

// Quartiles sur VMA (ascendant)
function quartileBuckets(listAsc){
  const n = listAsc.length;
  const q1 = Math.floor(n*0.25), q2 = Math.floor(n*0.5), q3 = Math.floor(n*0.75);
  const B = listAsc.slice(0, q1);
  const Mminus = listAsc.slice(q1, q2);
  const Mplus  = listAsc.slice(q2, q3);
  const H = listAsc.slice(q3);
  return {H, Mplus, Mminus, B};
}
function take(bucket, sens="low"){
  if (!bucket.length) return null;
  return sens==="high" ? bucket.pop() : bucket.shift();
}

// ===== Coeur : génération des groupes =====
function genererGroupesZenos(){
  const all = safeParse(localStorage.getItem("eleves")) || [];
  for(const e of all){ if(e) e.classe = canonClasse(e.classe || e.Classe || ""); }

  const select = document.getElementById("classe-select");
  const choix = select && select.value ? select.value : "__TOUS__";
  window._zenosChoixClasse = choix;

  // Filtre candidats
  let cand = [];
  for(const e of all){
    const v = Number(e && e.vma);
    if (!isFinite(v)) continue;
    if (choix !== "__TOUS__" && canonClasse(e.classe) !== choix) continue;
    cand.push({
      nom: e.nom || e.Nom || "",
      prenom: e.prenom || e.Prénom || e.Prenom || "",
      classe: e.classe || "",
      sexe: normSexe(e.sexe || e.Sexe || ""),
      distance: e.distance || e.Distance || "",
      vma: v
    });
  }

  const titre = document.getElementById("titre-classe");
  if (titre) titre.textContent = (choix==="__TOUS__") ? "Tous (classe ignorée)" : ("Classe " + choix);

  if (cand.length < 4){ alert("Pas assez d'élèves valides (VMA) pour former des groupes."); return; }

  // Tri ascendant → quartiles
  cand.sort((a,b)=> a.vma - b.vma);
  const {H, Mplus, Mminus, B} = quartileBuckets(cand);

  const G = Math.floor(cand.length / 4);
  const groupes = [];
  const h = H.slice(), mp = Mplus.slice(), mm = Mminus.slice(), b = B.slice();

  // Construction “idéale” : [H, M+, M-, B]
  for (let g=0; g<G; g++){
    let gH = take(h, "high") || take(mp,"high") || take(mm,"high") || take(b,"high");
    let gM1 = take(mp,"high") || take(mm,"high") || take(h,"high") || take(b,"high");
    let gM2 = take(mm,"low")  || take(mp,"low")  || take(h,"low")  || take(b,"low");
    let gB  = take(b,"low")   || take(mm,"low")  || take(mp,"low") || take(h,"low");

    const pack = [gH, gM1, gM2, gB].filter(Boolean);
    if (pack[0]) pack[0].role = "H";
    if (pack[1]) pack[1].role = "M+";
    if (pack[2]) pack[2].role = "M-";
    if (pack[3]) pack[3].role = "B";

    if (pack.length===4) groupes.push(pack);
    else break;
  }

  const restants = [...h, ...mp, ...mm, ...b];

  // Équilibrage auto minimal (swaps même rôle) pour atteindre au moins 1F + 1G
  balanceMixiteAuto(groupes);

  // Mémorise l’état
  window._zenosGroupes = groupes;
  window._zenosRestants = restants;

  // Suggestions restantes (si certains groupes ne sont toujours pas mixtes)
  const suggestions = computeSwapSuggestions(groupes);

  renderTableauGroupes(groupes, restants, suggestions);
}

// ===== Mixité : auto-fix minimal + suggestions =====
function countFG(g){
  let F=0,G=0; for (const e of g){ if (e.sexe==="F") F++; else if (e.sexe==="G") G++; } return {F,G};
}
function indexByRole(groups){
  const idx = {H:{F:[],G:[]}, "M+":{F:[],G:[]}, "M-":{F:[],G:[]}, B:{F:[],G:[]}};
  groups.forEach((g,gi)=>{
    g.forEach((e,ei)=>{
      const r = e.role || "M+";
      if (e.sexe==="F"||e.sexe==="G") idx[r][e.sexe].push({gi, ei});
    });
  });
  return idx;
}

// Petit équilibrage auto : si un groupe n’a pas F (ou pas G), on essaie UN swap même rôle
function balanceMixiteAuto(groupes){
  const idx = indexByRole(groupes);
  for (let gi=0; gi<groupes.length; gi++){
    const g = groupes[gi], c = countFG(g);
    if (c.F===0 || c.G===0){
      const need = (c.F===0) ? "F" : "G";
      const have = (c.F===0) ? "G" : "F";
      for (let ei=0; ei<g.length; ei++){
        const e = g[ei]; if (e.sexe !== have) continue;
        const role = e.role || "M+";
        const donors = idx[role][need].filter(p => p.gi !== gi);
        const donor = donors.find(p => {
          const oc = countFG(groupes[p.gi]);
          return (need==="F" ? oc.F : oc.G) >= 2;
        }) || donors[0];
        if (donor){
          const d = groupes[donor.gi][donor.ei];
          groupes[gi][ei] = d;
          groupes[donor.gi][donor.ei] = e;
          break;
        }
      }
    }
  }
}

// Suggestions restantes (échanges cliquables), même rôle uniquement
function computeSwapSuggestions(groupes){
  const res = [];
  const roles = ["H","M+","M-","B"];
  const needs = groupes.map((g,gi) => {
    const c = countFG(g);
    return {gi, F:c.F, G:c.G};
  });

  for (const {gi, F, G} of needs){
    if (F===0 || G===0){
      const want = (F===0) ? "F" : "G";
      const give = (F===0) ? "G" : "F";
      for (const role of roles){
        const aIdx = groupes[gi].findIndex(e => e.sexe===give && (e.role||"M+")===role);
        if (aIdx === -1) continue;
        for (let gj=0; gj<groupes.length; gj++){
          if (gj===gi) continue;
          const bIdx = groupes[gj].findIndex(e => e.sexe===want && (e.role||"M+")===role);
          if (bIdx === -1) continue;
          const cj = countFG(groupes[gj]);
          if ((want==="F" ? cj.F : cj.G) < 2) continue; // ne déséquilibre pas l’autre

          const A = groupes[gi][aIdx], B = groupes[gj][bIdx];
          res.push({
            a: {gi, ei:aIdx, nom:A.nom, prenom:A.prenom, role:role, sexe:A.sexe},
            b: {gi:gj, ei:bIdx, nom:B.nom, prenom:B.prenom, role:role, sexe:B.sexe},
            label: `Échanger ${A.prenom} ${A.nom} (${A.sexe}, ${role}) du Groupe ${gi+1} ↔ ${B.prenom} ${B.nom} (${B.sexe}, ${role}) du Groupe ${gj+1}`
          });
          break; // 1 suggestion par rôle suffit
        }
      }
    }
  }
  return res;
}

// Appliquer un swap depuis une suggestion
function zenosApplySwap(idx){
  const suggs = computeSwapSuggestions(window._zenosGroupes);
  const s = suggs[idx]; if (!s) return;
  const gA = window._zenosGroupes[s.a.gi], gB = window._zenosGroupes[s.b.gi];
  const tmp = gA[s.a.ei];
  gA[s.a.ei] = gB[s.b.ei];
  gB[s.b.ei] = tmp;
  const newSugg = computeSwapSuggestions(window._zenosGroupes);
  renderTableauGroupes(window._zenosGroupes, window._zenosRestants, newSugg);
}

// Tout appliquer (boucle jusqu’à ce qu’il n’y ait plus de suggestions ou limite)
function zenosApplyAllSwaps(){
  let guard = 40; // sécurité
  while (guard-- > 0){
    const suggs = computeSwapSuggestions(window._zenosGroupes);
    if (!suggs.length) break;
    // applique la première suggestion
    const s = suggs[0];
    const gA = window._zenosGroupes[s.a.gi], gB = window._zenosGroupes[s.b.gi];
    const tmp = gA[s.a.ei];
    gA[s.a.ei] = gB[s.b.ei];
    gB[s.b.ei] = tmp;
  }
  const newSugg = computeSwapSuggestions(window._zenosGroupes);
  renderTableauGroupes(window._zenosGroupes, window._zenosRestants, newSugg);
}

// ===== Rendu =====
function renderTableauGroupes(groupes, nonAttribues, suggestions){
  const groupesDiv = document.getElementById("groupes");
  const restantsDiv = document.getElementById("restants");
  if (groupesDiv) groupesDiv.innerHTML = "";
  if (restantsDiv) restantsDiv.innerHTML = "";
  if (!groupesDiv) return;

  const table = document.createElement("table");
  table.className = "zenos-unique";
  table.innerHTML =
    '<thead>' +
      '<tr><th>Groupe</th><th>Nom</th><th>Prénom</th><th>Classe</th><th>Sexe</th><th>VMA</th><th>Distance</th></tr>' +
    '</thead><tbody></tbody>';
  groupesDiv.appendChild(table);

  const tbody = table.querySelector("tbody");
  for (let g=0; g<groupes.length; g++){
    const pack = groupes[g];
    for (let i=0; i<pack.length; i++){
      const e = pack[i];
      const tr = document.createElement("tr");
      if (i===0){
        const tdG = document.createElement("td");
        tdG.setAttribute("rowspan","4");
        tdG.style.fontWeight = "700";
        tdG.textContent = "Groupe " + (g+1);
        tr.appendChild(tdG);
      }
      appendCell(tr, e.nom);
      appendCell(tr, e.prenom);
      appendCell(tr, e.classe);
      appendCell(tr, e.sexe);
      appendCell(tr, e.vma);
      appendCell(tr, e.distance);
      tbody.appendChild(tr);
    }
    const sep = document.createElement("tr");
    sep.className = "separator-row";
    const sepTd = document.createElement("td");
    sepTd.setAttribute("colspan","7");
    sep.appendChild(sepTd);
    tbody.appendChild(sep);
  }

  // Restants
  if (nonAttribues && nonAttribues.length && restantsDiv){
    const h = document.createElement("div");
    h.className = "unassigned-title";
    h.textContent = "Élèves à attribuer manuellement car groupes complets :";
    restantsDiv.appendChild(h);

    const tabR = document.createElement("table");
    tabR.className = "unassigned";
    tabR.innerHTML =
      '<thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th>Sexe</th><th>VMA</th><th>Distance</th></tr></thead>' +
      '<tbody>' +
      nonAttribues.map(e => (
        '<tr>' +
          '<td>'+esc(e.nom)+'</td>' +
          '<td>'+esc(e.prenom)+'</td>' +
          '<td>'+esc(e.classe)+'</td>' +
          '<td>'+esc(e.sexe)+'</td>' +
          '<td>'+esc(e.vma)+'</td>' +
          '<td>'+esc(e.distance)+'</td>' +
        '</tr>'
      )).join("") +
      '</tbody>';
    restantsDiv.appendChild(tabR);
  }

  // Suggestions d’échanges (mixité)
  if (suggestions && suggestions.length && restantsDiv){
    const box = document.createElement("div");
    box.style.marginTop = "10px";
    box.style.padding = "10px";
    box.style.border = "1px solid #f2c200";
    box.style.background = "#fff8db";
    box.style.borderRadius = "8px";
    box.innerHTML = "<strong>Mixité partielle :</strong> suggestions d’échanges (même rôle)";
    restantsDiv.appendChild(box);

    // Bouton "Tout appliquer"
    const actions = document.createElement("div");
    actions.style.textAlign = "right";
    const allBtn = document.createElement("button");
    allBtn.textContent = "Tout appliquer";
    allBtn.style.padding = "4px 10px";
    allBtn.style.border = "1px solid #aaa";
    allBtn.style.borderRadius = "6px";
    allBtn.style.background = "#f2f2f2";
    allBtn.onclick = zenosApplyAllSwaps;
    actions.appendChild(allBtn);
    box.appendChild(actions);

    const ul = document.createElement("ul");
    ul.style.marginTop = "6px";
    suggestions.forEach((s, i) => {
      const li = document.createElement("li");
      li.style.margin = "6px 0";
      const btn = document.createElement("button");
      btn.textContent = "Appliquer";
      btn.style.marginLeft = "8px";
      btn.style.padding = "2px 8px";
      btn.style.border = '1px solid #aaa';
      btn.style.borderRadius = "6px";
      btn.style.background = "#f2f2f2";
      btn.onclick = () => zenosApplySwap(i);

      const span = document.createElement("span");
      span.textContent = " " + s.label;
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    restantsDiv.appendChild(ul);
  }
}

// ===== Exports =====
function exporterGroupesCSV(){
  // Utilise l’état mémoire si dispo (plus fiable que le DOM)
  const groupes = window._zenosGroupes || [];
  if (!groupes.length){
    alert("Générez les groupes avant d’exporter.");
    return;
  }

  const csv = [];
  csv.push(["Groupe","Nom","Prénom","Classe","Sexe","VMA","Distance"].join(","));
  for (let g=0; g<groupes.length; g++){
    for (const e of groupes[g]){
      csv.push([`Groupe ${g+1}`, e.nom, e.prenom, e.classe, e.sexe, e.vma, e.distance].map(csvSafe).join(","));
    }
  }

  const blob = new Blob(["\uFEFF"+csv.join("\n")], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "groupes_zenos.csv";
  a.click();
}
function csvSafe(t){ let s=String(t); if (/,/.test(s)) s='"'+s.replace(/"/g,'""')+'"'; return s; }

function imprimerGroupes(){
  const zone = document.getElementById("groupes-panel");
  if (!zone) return;
  const win = window.open("", "_blank");
  win.document.write(
    '<html><head><meta charset="UTF-8"><title>Impression - Groupes ZENOS</title>' +
    '<style>table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f2f2f2}tr.separator-row td{border:none;height:10px} .unassigned-title{margin:12px 0 6px;font-weight:700;color:#cc5200} .unassigned thead th{background:#ffe9cc}.unassigned tbody td{background:#fff4e6}</style>' +
    '</head><body>' +
    '<h1 style="text-align:center;">ZENOS TOUR</h1>' +
    zone.innerHTML +
    '<div style="margin-top:24px;text-align:center;">ScanProf - Équipe EPS Lycée Vauban - LUXEMBOURG - JB</div>' +
    '</body></html>'
  );
  win.document.close();
  try { win.focus(); win.print(); } catch(e){}
}
function exporterGroupesPDF(){ imprimerGroupes(); }

function envoyerGroupesParMail(){
  const groupes = window._zenosGroupes || [];
  if (!groupes.length){
    alert("Générez les groupes avant d’envoyer par mail.");
    return;
  }

  const titreElt = document.getElementById("titre-classe");
  const classeTitre = (titreElt ? titreElt.textContent.trim() : "") || "Tous (classe ignorée)";
  const subject = `Groupes ZENOS TOUR – ${classeTitre}`;

  const lignes = [];
  lignes.push("Bonjour,","");
  lignes.push(`Voici vos groupes pour le ZENOS TOUR – ${classeTitre} :`,"");

  for (let g=0; g<groupes.length; g++){
    lignes.push(`Groupe ${g+1} :`);
    for (const e of groupes[g]) lignes.push(`- ${e.nom} ${e.prenom}`);
    lignes.push(""); // ligne vide entre groupes
  }

  lignes.push("Cordialement,","L’équipe ScanProf");

  const bodyText = lignes.join("\n");
  const mailto = "mailto:?subject=" + encodeURIComponent(subject) +
                 "&body=" + encodeURIComponent(bodyText);
  window.location.href = mailto;
}
