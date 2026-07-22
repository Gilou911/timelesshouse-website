import"./modulepreload-polyfill-B5Qt9EMX.js";import{c as R}from"./index-CoN1UZ5H.js";const S=R("https://vpbxeqjvaeiytxcpilxf.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwYnhlcWp2YWVpeXR4Y3BpbHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDkxMTMsImV4cCI6MjA5Mjk4NTExM30.v14QffjzBY83mlxAHzFLkMRolQlWHfYkGhx-q4pkoQI"),w=document.getElementById("app"),P=document.getElementById("boot"),v=new URLSearchParams(location.search).get("g"),z=new Set(["creme","lin","sauge","brume"]),N=new Set(["noir","creme","ardoise","fumee","encre","sapin","lin","sauge","brume","bordeaux","acajou","foret"]),i=e=>String(e??"").replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]);function J(e){const n=N.has(e.theme)?e.theme:"noir";document.documentElement.dataset.theme=n,document.documentElement.classList.toggle("is-light",z.has(n));const t=getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),s=document.querySelector('meta[name="theme-color"]');s&&t&&s.setAttribute("content",t)}function I(e){try{S.rpc("photobooth_track",{p_token:v,p_metric:e})}catch{}}function _(e,n,t){P.classList.add("gone"),w.innerHTML=`
        <div class="state"><div class="state-box">
          <div class="state-mark">TimelessHouse<span>.</span></div>
          <div class="state-sep"></div>
          <div class="state-kicker">${i(e)}</div>
          <div class="state-title">${i(n)}</div>
          <p>${i(t)}</p>
          <a href="mailto:service@timelesshouse.org">Contacter TimelessHouse</a>
        </div></div>`}const d=document.getElementById("lb"),Y=document.getElementById("lb-img"),F=document.getElementById("lb-count"),j=document.getElementById("lb-dl");let h=[],c=-1,E=null,L=!1,C=0;function X(){C=window.scrollY||0;const e=document.body.style;e.position="fixed",e.top=`-${C}px`,e.left="0",e.right="0",e.width="100%",document.body.classList.add("no-scroll")}function G(){const e=document.body.style;e.position="",e.top="",e.left="",e.right="",e.width="",document.body.classList.remove("no-scroll"),window.scrollTo(0,C)}function b(e){if(!h.length)return;const n=d.classList.contains("open");c=(e+h.length)%h.length;const t=h[c];Y.src=t.display_url||t.url,j.href=t.url,F.textContent=c+1+" / "+h.length,d.classList.add("open"),n||(X(),E=document.activeElement,document.getElementById("lb-close").focus(),history.pushState({pbLightbox:!0},""),L=!0)}const k=document.getElementById("lb-share");navigator.share&&(k.hidden=!1);k.addEventListener("click",async e=>{e.preventDefault();const n=h[c];if(!n)return;const t=k.textContent;k.textContent="Préparation…";try{const a=await(await fetch(n.display_url||n.url)).blob(),p=new File([a],(n.stem||"photo")+".jpg",{type:"image/jpeg"});navigator.canShare&&navigator.canShare({files:[p]})?await navigator.share({files:[p]}):await navigator.share({title:"Ma photo — TimelessHouse",url:location.href}),I("share")}catch(s){if(s&&s.name!=="AbortError")try{await navigator.share({url:location.href})}catch{}}k.textContent=t});function T(e=!1){d.classList.remove("open"),G(),c=-1,E&&E.focus&&(E.focus(),E=null),L&&!e?(L=!1,history.back()):L=!1}window.addEventListener("popstate",()=>{d.classList.contains("open")&&T(!0)});d.addEventListener("keydown",e=>{if(e.key!=="Tab")return;const n=[...d.querySelectorAll("button, a[href]")].filter(a=>!a.hidden&&a.offsetParent!==null);if(!n.length)return;const t=n[0],s=n[n.length-1];e.shiftKey&&document.activeElement===t?(e.preventDefault(),s.focus()):!e.shiftKey&&document.activeElement===s&&(e.preventDefault(),t.focus())});j.addEventListener("click",()=>I("download"));document.getElementById("lb-report").addEventListener("click",e=>{e.preventDefault();const n=h[c];if(!n)return;const t=encodeURIComponent("Photobooth — retirer une photo"),s=encodeURIComponent(`Bonjour,

Je souhaite retirer cette photo de ma galerie :
Photo : `+n.stem+`
Galerie : `+location.href+`

Merci.`);location.href="mailto:service@timelesshouse.org?subject="+t+"&body="+s});document.getElementById("lb-close").addEventListener("click",T);document.getElementById("lb-prev").addEventListener("click",()=>b(c-1));document.getElementById("lb-next").addEventListener("click",()=>b(c+1));window.addEventListener("keydown",e=>{d.classList.contains("open")&&(e.key==="Escape"&&T(),e.key==="ArrowLeft"&&b(c-1),e.key==="ArrowRight"&&b(c+1))});d.addEventListener("touchmove",e=>e.preventDefault(),{passive:!1});let x=null;d.addEventListener("touchstart",e=>{x=e.touches[0].clientX},{passive:!0});d.addEventListener("touchend",e=>{if(e.target.closest("a, button")){x=null;return}if(x===null)return;const n=e.changedTouches[0].clientX-x;Math.abs(n)>48&&b(c+(n<0?1:-1)),x=null},{passive:!0});const r={done:!1,firstName:"",pricing:!1,dirty:!1},V=e=>"https://timelesshouse.org/?utm_source=photobooth&utm_medium=gallery&utm_campaign="+encodeURIComponent(e||"photobooth");function Z(e){return r.done?M(e):`
        <form id="lead-form" novalidate>
          <div class="seg" role="radiogroup" aria-label="Ta demande">
            <label class="seg-opt"><input type="radio" name="motif" value="evenement">
              J'ai besoin de vidéos/photos pour&nbsp;:</label>
            <label class="seg-opt"><input type="radio" name="motif" value="infos">
              Découvrir les prestations</label>
          </div>
          <div id="lead-fields" hidden>
            <div data-branch="evenement" hidden>
              <label class="lf">Type d'événement
                <select name="event_type">
                  <option>Mariage</option>
                  <option>Anniversaire</option>
                  <option>Événement d'entreprise</option>
                  <option>Autre</option>
                </select>
              </label>
              <label class="lf">Période envisagée <span class="opt">(facultatif)</span>
                <input type="text" name="event_date" placeholder="septembre 2026">
              </label>
              <label class="lf-check"><input type="checkbox" name="wants_pricing">
                Je souhaite connaître le tarif du photobooth</label>
              <label class="lf">Téléphone <span class="opt">(facultatif)</span>
                <input type="tel" name="phone" inputmode="tel" autocomplete="tel">
              </label>
            </div>
            <div data-branch="infos" hidden>
              <p class="lf-cap">Ce qui t'intéresse</p>
              <label class="lead-check"><input type="checkbox" name="interests" value="Film de mariage">Film de mariage</label>
              <label class="lead-check"><input type="checkbox" name="interests" value="Photographie">Photographie</label>
              <label class="lead-check"><input type="checkbox" name="interests" value="Photobooth">Photobooth</label>
              <label class="lead-check"><input type="checkbox" name="interests" value="Immobilier">Immobilier</label>
              <label class="lead-check"><input type="checkbox" name="interests" value="Contenu & réseaux sociaux">Contenu &amp; réseaux sociaux</label>
            </div>
            <label class="lf">Prénom
              <input type="text" name="first_name" autocomplete="given-name" maxlength="80">
            </label>
            <label class="lf">Email
              <input type="email" name="email" inputmode="email" autocomplete="email"
                     placeholder="nom@exemple.com" maxlength="200">
            </label>
            <label class="lf">Un mot sur ton projet <span class="opt">(facultatif)</span>
              <textarea name="message" rows="2" maxlength="1000"></textarea>
            </label>
            <div class="lead-err" id="lead-err" hidden></div>
            <button type="submit" class="lead-go" id="lead-go">Envoyer</button>
          </div>
        </form>`}function M(e){return`
        <div class="lead-done">
          <p class="ld-title">Merci ${i(r.firstName)} — c'est bien reçu.</p>
          <p>Réponse personnalisée par email, très vite.</p>
          ${r.pricing?`
          <div class="price-card">
            <p class="price-kicker">Photobooth studio</p>
            <p class="price-main">500&nbsp;€ <span>· 4 heures</span></p>
            <p class="price-notes">Hors installation et désinstallation.<br>
              Au-delà des 4 heures : 100&nbsp;€ par tranche de 30 minutes.</p>
          </div>`:""}
          <p style="margin-top:22px"><a class="btn-site" id="ld-link"
            href="${i(V(e.event_code))}"
            style="color:var(--accent);letter-spacing:0.2em;text-transform:uppercase;font-size:11px;text-decoration:none;border-bottom:1px solid var(--accent);padding-bottom:3px">
            Découvrir TimelessHouse</a></p>
        </div>`}function A(e){const n=document.getElementById("ld-link");n&&n.addEventListener("click",()=>I("cta_click"));const t=document.getElementById("lead-form");if(!t)return;const s=document.getElementById("lead-fields"),a=[...t.querySelectorAll("[data-branch]")];t.querySelectorAll('input[name="motif"]').forEach(p=>{p.addEventListener("change",()=>{r.dirty=!0,t.querySelectorAll(".seg-opt").forEach(l=>l.classList.toggle("on",l.querySelector("input").checked)),s.hidden=!1,a.forEach(l=>{l.hidden=l.dataset.branch!==p.value})})}),t.addEventListener("input",()=>{r.dirty=!0}),t.addEventListener("submit",async p=>{p.preventDefault();const l=document.getElementById("lead-err"),f=document.getElementById("lead-go"),o=m=>{l.textContent=m,l.hidden=!1};l.hidden=!0;const u=(t.querySelector('input[name="motif"]:checked')||{}).value,g=t.first_name.value.trim(),$=t.email.value.trim().toLowerCase();if(!u)return o("Choisis d’abord ce qui t’amène.");if(!g)return o("Ton prénom est obligatoire.");if(!$.includes("@"))return o("Une adresse email valide est obligatoire.");const y=u==="evenement",B=y&&t.wants_pricing.checked,D=[...t.querySelectorAll('input[name="interests"]:checked')].map(m=>m.value).join(", ");f.disabled=!0,f.textContent="Envoi…";try{const{data:m,error:H}=await S.rpc("photobooth_lead",{p_token:v,p_motif:u,p_first_name:g,p_email:$,p_event_type:y?t.event_type.value:null,p_event_date:y?t.event_date.value.trim():null,p_interests:y?null:D,p_wants_pricing:B,p_phone:y?t.phone.value.trim():null,p_message:t.message.value.trim()});if(H)throw H;if(m&&m.error)throw new Error(m.error);r.done=!0,r.firstName=g,r.pricing=B,r.dirty=!1,document.getElementById("lead-zone").innerHTML=M(e),A(e);return}catch(m){console.error(m),o("Le réseau n’a pas répondu — réessaie dans un instant.")}f.disabled=!1,f.textContent="Envoyer"})}function O(e){const n=e.config||{};J(n);const t=e.photos||[];h=t;const s=n.event_name||"",a=t.length,p=n.layout==="grille"?"grille":"masonry",l=a?t[a-1].display_url||t[a-1].url:"";w.innerHTML=`
        <header class="cover ${a?"":"no-photo"}">
          ${a?`<div class="cover-bg" style="background-image:url('${i(l)}')"></div>`:""}
          <div class="cover-inner">
            <span class="cover-photog">TimelessHouse — Photobooth</span>
            <h1>${i(e.first_name)}</h1>
            <div class="cover-meta">
              ${s?`<span>${i(s)}</span><i></i>`:""}
              <span>${a?a+" photo"+(a>1?"s":""):"Tes photos arrivent"}</span>
            </div>
          </div>
          <button class="cover-scroll" id="to-gallery" type="button">
            <span>Découvrir</span><span class="ln"></span>
          </button>
        </header>

        ${a?`
        <main class="gallery" id="gallery">
          <div class="gallery-head">
            <div class="gallery-title">La galerie</div>
            <div class="gallery-note">Un clic sur une photo pour l'ouvrir · ⬇ pour l'enregistrer</div>
          </div>
          <div class="grid-${p}">
            ${t.map((o,u)=>`
              <figure class="ph" data-i="${u}">
                <img src="${i(o.thumb_url||o.url)}" alt="Photo ${i(o.stem)}" loading="lazy"
                     ${o.thumb_w&&o.thumb_h?`style="aspect-ratio:${o.thumb_w}/${o.thumb_h}"`:""}>
                <a class="dl" href="${i(o.url)}" title="Enregistrer" aria-label="Enregistrer">⬇</a>
              </figure>`).join("")}
          </div>
        </main>`:`
        <main class="gallery">
          <div class="gallery-head">
            <div class="gallery-title">Encore un peu de patience…</div>
            <div class="gallery-note">La page se met à jour toute seule</div>
          </div>
          <p style="color:var(--ink-soft); font-size:14px; line-height:1.8; max-width:480px">
            Passe devant l'objectif : chaque photo où tu apparais rejoint cette
            galerie automatiquement, quelques secondes après la prise de vue.
          </p>
        </main>`}

        <section class="cta">
          <div class="ln"></div>
          <p class="cta-kicker">TimelessHouse</p>
          <h2>Un projet, une envie&nbsp;?</h2>
          <p>Deux questions, trente secondes — et une vraie réponse par email.</p>
          <div id="lead-zone">${Z(e)}</div>
        </section>

        <footer class="site">Photos &amp; souvenirs par
          <a href="https://timelesshouse.org">TimelessHouse</a>
          <span class="help">Un souci avec tes photos&nbsp;?
            <a href="mailto:service@timelesshouse.org?subject=${encodeURIComponent("Photobooth — besoin d'aide")}&body=${encodeURIComponent("Mon lien de galerie : "+location.href)}">Écris-nous</a></span>
        </footer>
      `;const f=document.getElementById("to-gallery");f&&f.addEventListener("click",()=>{const o=document.getElementById("gallery");o&&o.scrollIntoView({behavior:"smooth"})}),w.querySelectorAll(".ph").forEach(o=>{const u=o.querySelector("img");u.complete?u.classList.add("on"):u.addEventListener("load",()=>u.classList.add("on")),o.addEventListener("click",g=>{if(g.target.closest(".dl")){I("download");return}b(Number(o.dataset.i))})}),A(e),P.classList.add("gone")}let q=-1;async function U(e){if(!v){_("Accès","Lien incomplet.","Utilise le lien personnel reçu par email de TimelessHouse — cherche « TimelessHouse » dans ta boîte mail (pense aux spams).");return}const{data:n,error:t}=await S.rpc("photobooth_gallery",{p_token:v});if(t){e&&_("Connexion","Petit souci de réseau.","Réessaie dans un instant — tes photos sont bien à l’abri."),console.error(t);return}if(!n){_("Accès","Galerie introuvable.","Ce lien ne correspond à aucune galerie. Vérifie le lien exact reçu par email, ou écris-nous.");return}const s=(n.photos||[]).length;s!==q&&!(r.dirty&&!r.done)&&(q=s,O(n)),e&&!sessionStorage.getItem("pb-open-"+v)&&(sessionStorage.setItem("pb-open-"+v,"1"),I("gallery_open"))}U(!0);setInterval(()=>{d.classList.contains("open")||U(!1)},45e3);
