import"./modulepreload-polyfill-B5Qt9EMX.js";import{c as y}from"./index-CoN1UZ5H.js";const b=y("https://vpbxeqjvaeiytxcpilxf.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwYnhlcWp2YWVpeXR4Y3BpbHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDkxMTMsImV4cCI6MjA5Mjk4NTExM30.v14QffjzBY83mlxAHzFLkMRolQlWHfYkGhx-q4pkoQI"),f=document.getElementById("app"),v=document.getElementById("boot"),h=new URLSearchParams(location.search).get("e"),I=new Set(["creme","lin","sauge","brume"]),x=new Set(["noir","creme","ardoise","fumee","encre","sapin","lin","sauge","brume","bordeaux","acajou","foret"]),p=n=>String(n??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);function d(n,e,t=""){v.classList.add("gone"),f.innerHTML=`<div class="state"><div class="ln"></div>
        <p class="kicker">Photobooth</p>
        <h1>${n}</h1><p>${e}</p>${t}</div>`}let u=null;async function L(n){const e=await createImageBitmap(n).catch(()=>null);if(!e)throw new Error("unreadable");const i=Math.min(1,1280/Math.max(e.width,e.height)),s=document.createElement("canvas");s.width=Math.round(e.width*i),s.height=Math.round(e.height*i),s.getContext("2d").drawImage(e,0,0,s.width,s.height);let o=s.toDataURL("image/jpeg",.85);return o.length>7e5&&(o=s.toDataURL("image/jpeg",.68)),o}function k(n){const e=n.event_name||"La soirée";f.innerHTML=`
        <p class="kicker">Photobooth — Inscription</p>
        <h1>${p(e)}</h1>
        <p class="lead">Inscris-toi : chaque photo où tu apparais rejoindra ta
          galerie privée, et tu recevras le lien par email.</p>

        <form id="f" novalidate>
          <label>Prénom
            <input type="text" name="first_name" maxlength="80" autocomplete="given-name" required>
          </label>
          <label>Email
            <input type="email" name="email" maxlength="200" autocomplete="email" required>
          </label>
          <label style="margin-bottom:8px">Selfie de référence</label>
          <label class="selfie-zone" id="zone">
            <input type="file" name="selfie" accept="image/*">
            <span id="zone-inner">
              <span class="ph-icon">◉</span>
              <span class="txt">Prends un selfie — bien éclairé, de face, seul</span>
            </span>
          </label>

          <label class="consent">
            <input type="checkbox" name="consent" required>
            <span>J'accepte que mon selfie serve uniquement à retrouver mes photos.
            Il transite par un serveur sécurisé le temps du traitement
            (quelques minutes), y est supprimé, puis reste sur l'ordinateur du
            studio jusqu'à sa suppression après l'événement.
            <a href="https://timelesshouse.org/confidentialite" target="_blank"
               rel="noopener">Politique de confidentialité</a></span>
          </label>
          <label class="consent">
            <input type="checkbox" name="marketing">
            <span>Je souhaite recevoir les actualités et offres de TimelessHouse
            (facultatif).</span>
          </label>

          <div class="err" id="err"></div>
          <button type="submit" class="submit" id="go">M'inscrire</button>
        </form>

        <p class="alt-hint">Pas de réseau ici&nbsp;? La tablette à l'entrée du
        studio fait exactement la même chose, sans internet.</p>
      `;const t=document.getElementById("f"),i=document.getElementById("zone"),s=document.getElementById("err"),o=document.getElementById("go");i.querySelector("input").addEventListener("change",async m=>{const l=m.target.files[0];if(!l)return;const c=document.getElementById("zone-inner");c.innerHTML='<span class="txt">Préparation de la photo…</span>';try{const a=await L(l);u=a.split(",")[1],c.innerHTML=`<img src="${a}" alt="Ton selfie">
            <span class="txt">Parfait — touche pour changer</span>`}catch{u=null,c.innerHTML=`<span class="ph-icon">◉</span>
            <span class="txt">Photo illisible — réessaie avec l'appareil photo</span>`}}),t.addEventListener("submit",async m=>{m.preventDefault(),s.classList.remove("on");const l=t.first_name.value.trim(),c=t.email.value.trim().toLowerCase(),a=r=>{s.textContent=r,s.classList.add("on")};if(!l)return a("Ton prénom est obligatoire.");if(!c.includes("@"))return a("Une adresse email valide est obligatoire.");if(!u)return a("Ajoute un selfie pour qu’on puisse retrouver tes photos.");if(!t.consent.checked)return a("Coche la case de consentement pour continuer.");o.disabled=!0,o.textContent="Envoi en cours…";try{const{data:r,error:g}=await b.rpc("photobooth_signup",{p_event:h,p_first_name:l,p_email:c,p_selfie_b64:u,p_marketing:t.marketing.checked});if(g)throw g;if(r.error==="saturated")a("Les inscriptions en ligne sont saturées — passe à la tablette à l’entrée du studio.");else if(r.error==="event_unknown")a("Ce lien d’inscription n’est plus actif.");else if(r.error)a("Vérifie tes informations et réessaie.");else{M(l,r.token);return}}catch(r){console.error(r),a("Le réseau n’a pas répondu — réessaie, ou utilise la tablette à l’entrée.")}o.disabled=!1,o.textContent="M'inscrire"})}function M(n,e){const t="https://timelesshouse.org/photobooth?g="+e;f.innerHTML=`
        <div class="state">
          <div class="ln"></div>
          <p class="kicker">C'est noté</p>
          <h1>Merci ${p(n)}&nbsp;!</h1>
          <p>Ta reconnaissance sera active <strong>d'ici quelques minutes</strong> —
          ensuite, chaque photo où tu apparais rejoindra ta galerie toute seule.</p>
          <div class="link-box">${p(t)}</div>
          <a class="btn" href="${p(t)}">Ouvrir ma galerie</a>
          <button class="btn" id="copy">Copier le lien</button>
          <p class="note">Tu recevras aussi le lien par email dès ta première
          photo — <strong>c'est lui qui fait foi</strong>, garde-le. Si tes photos
          ne semblent pas arriver, réinscris-toi avec le même email : ton selfie
          sera simplement remplacé.</p>
        </div>`,document.getElementById("copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(t)}catch{}document.getElementById("copy").textContent="Copié ✓"})}async function E(){if(!h){d("Lien incomplet.","Ce lien d’inscription ne précise pas l’événement. Scanne le QR code affiché au studio, ou utilise la tablette à l’entrée.");return}const{data:n,error:e}=await b.rpc("photobooth_event_info",{p_event:h});if(e){d("Petit souci de réseau.","Réessaie dans un instant — ou utilise la tablette à l’entrée du studio.");return}if(!n){d("Inscriptions fermées.","Ce lien ne correspond à aucun événement en cours. Vérifie le QR code affiché au studio.");return}const t=x.has(n.theme)?n.theme:"noir";document.documentElement.dataset.theme=t,document.documentElement.classList.toggle("is-light",I.has(t));const i=getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),s=document.querySelector('meta[name="theme-color"]');s&&i&&s.setAttribute("content",i),k(n),v.classList.add("gone")}E();
