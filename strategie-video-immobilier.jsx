import { useState } from "react";

const concepts = [
  {
    id: 1,
    emoji: "💰",
    titre: "Budget réel en Île-de-France",
    hook: "\"On m'a dit 200K… mais personne ne m'a dit combien ça coûte VRAIMENT.\"",
    visuel: "Constructeur face caméra, tableau blanc derrière avec fourchette de prix manuscrite. Cut rapide : extérieur maison neuve, puis facture floue.",
    texteEcran: ["⚠️ VÉRITÉ sur les prix IDF", "Entre 1 600 et 2 200 €/m²", "→ pour une maison clé en main", "Hors terrain. On vous explique tout."],
    cta: "💬 Estimez votre projet →",
    tag: "Lead Gen",
    tagColor: "#C9A84C",
    angle: "Brise la barrière prix #1",
  },
  {
    id: 2,
    emoji: "⏱️",
    titre: "2 ans de chantier — mythe ou réalité ?",
    hook: "\"Construire ça prend 2 ans, j'ai pas le temps.\" — On entend ça tout le temps. Voici la vérité.",
    visuel: "Timeline animée à l'écran : 6 grandes étapes. Voix off rapide. Image chantier à différentes phases.",
    texteEcran: ["❌ NON, pas 2 ans.", "Permis : 3–4 mois", "Chantier : 10–12 mois", "✅ Total réaliste : 15–18 mois"],
    cta: "📅 Téléchargez notre calendrier type",
    tag: "Éducation",
    tagColor: "#2D7A5F",
    angle: "Lève le frein \"délais\"",
  },
  {
    id: 3,
    emoji: "🎨",
    titre: "Personnalisation : choix réels ou catalogue ?",
    hook: "\"On nous a montré 3 façades et basta.\" — Chez nous, c'est pas comme ça.",
    visuel: "Mains feuilletant de vrais échantillons matériaux. Zoom sur plans sur table lumineuse. Client souriant devant son futur intérieur.",
    texteEcran: ["+ de 200 combinaisons", "Façade · Toiture · Intérieur", "Votre maison = votre style", "Pas une maison parmi d'autres."],
    cta: "📐 Visitez notre show-room virtuel",
    tag: "Désir",
    tagColor: "#7B5EA7",
    angle: "Différenciation produit",
  },
  {
    id: 4,
    emoji: "🏦",
    titre: "Construire sans apport, c'est possible ?",
    hook: "\"J'ai pas d'apport, je peux rien faire.\" — Faux. Voici ce que les banques ne disent pas.",
    visuel: "Chiffres qui s'affichent façon terminal. Conseiller et client devant ordinateur. Graphique prêt à 110%.",
    texteEcran: ["PTZ jusqu'à 40% du projet", "Prêt 110% possible", "Aides IDF cumulables", "→ 0€ d'apport, ça existe."],
    cta: "🧮 Simulez votre financement",
    tag: "Lead Gen",
    tagColor: "#C9A84C",
    angle: "Lève le frein financier #1",
  },
  {
    id: 5,
    emoji: "🗺️",
    titre: "Terrain + construction : le process concret",
    hook: "\"Je sais même pas par où commencer.\" — On vous montre les 5 étapes en 60 secondes.",
    visuel: "Animation schéma étapes. Vue aérienne terrain vague → fondations → maison finie. Voix calme et rassurante.",
    texteEcran: ["1. Trouver le terrain", "2. Valider votre financement", "3. Choisir votre maison", "4. Signer le CCMI", "5. Emménager 🏠"],
    cta: "📩 Guide PDF offert : \"Mon 1er projet\"",
    tag: "Éducation",
    tagColor: "#2D7A5F",
    angle: "Onboarding prospect froid",
  },
  {
    id: 6,
    emoji: "⚖️",
    titre: "Construire vs acheter dans l'ancien",
    hook: "\"L'ancien c'est moins cher\" — Vraiment ? On compare avec des vrais chiffres IDF.",
    visuel: "Split screen : maison ancienne vs maison neuve. Tableau comparatif simple. Calculatrice posée sur des plans.",
    texteEcran: ["Ancien 95m² en IDF", "→ 380 000 € + 40K travaux", "Neuf 95m² CCMI", "→ 320 000 € tout inclus ✅"],
    cta: "📊 Comparez votre situation",
    tag: "Viral",
    tagColor: "#C0392B",
    angle: "Contenu polémique = partages",
  },
  {
    id: 7,
    emoji: "📜",
    titre: "C'est quoi le CCMI ?",
    hook: "\"CCMI\" — Vous avez déjà entendu ça mais vous savez pas ce que c'est. 30 secondes pour tout comprendre.",
    visuel: "Document CCMI en gros plan, annotations animées. Icônes bouclier et maison. Ton pédagogique, pas commercial.",
    texteEcran: ["CCMI = votre bouclier légal", "Prix fixe garanti 🔒", "Délais contractuels", "Garanties 10 ans incluses"],
    cta: "✅ Téléchargez la checklist CCMI",
    tag: "Confiance",
    tagColor: "#2980B9",
    angle: "Bâtit la crédibilité",
  },
  {
    id: 8,
    emoji: "🤝",
    titre: "La peur de se lancer — ce qu'on vous dit",
    hook: "\"On a peur. On sait pas si c'est le bon moment.\" — Voilà exactement ce qu'on vous répond en premier RDV.",
    visuel: "Vrai conseiller (pas acteur) face caméra, bureau chaleureux en arrière-plan. Ton sincère, humain, pas vendeur.",
    texteEcran: ["Pas de pression.", "Pas d'engagement.", "Juste 45 minutes", "pour voir si c'est possible pour vous."],
    cta: "📞 Prenez RDV — C'est gratuit",
    tag: "Conversion",
    tagColor: "#E67E22",
    angle: "Bottom of funnel → RDV",
  },
];

const tagStyles = {
  "Lead Gen": { bg: "rgba(201,168,76,0.15)", border: "#C9A84C", text: "#C9A84C" },
  "Éducation": { bg: "rgba(45,122,95,0.15)", border: "#2D7A5F", text: "#5BBFA0" },
  "Désir": { bg: "rgba(123,94,167,0.15)", border: "#7B5EA7", text: "#A98DD6" },
  "Viral": { bg: "rgba(192,57,43,0.15)", border: "#C0392B", text: "#E74C3C" },
  "Confiance": { bg: "rgba(41,128,185,0.15)", border: "#2980B9", text: "#5DADE2" },
  "Conversion": { bg: "rgba(230,126,34,0.15)", border: "#E67E22", text: "#F0A050" },
};

export default function StrategieVideo() {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const selectedConcept = concepts.find((c) => c.id === selected);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0A0F1E 0%, #111827 60%, #0D1F17 100%)",
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: "#F5F0E8",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid rgba(201,168,76,0.2)",
        padding: "32px 40px 24px",
        background: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 32,
                background: "linear-gradient(180deg, #C9A84C, #8B6914)",
                borderRadius: 4,
              }} />
              <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C9A84C", fontWeight: 600 }}>
                Stratégie Contenu Vidéo Courte
              </span>
            </div>
            <h1 style={{
              margin: 0,
              fontSize: "clamp(20px, 3vw, 28px)",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}>
              8 Concepts Reels · TikTok · Shorts
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8B9BAA" }}>
              Constructeur maisons individuelles — Île-de-France
            </p>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { n: "8", label: "Concepts" },
              { n: "3", label: "Objectifs" },
              { n: "60s", label: "Format max" },
            ].map(({ n, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontFamily: "'Playfair Display', serif", color: "#C9A84C", fontWeight: 700 }}>{n}</div>
                <div style={{ fontSize: 11, color: "#6B7B8D", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        
        {/* Intro pill */}
        <div style={{
          background: "rgba(201,168,76,0.08)",
          border: "1px solid rgba(201,168,76,0.25)",
          borderRadius: 12,
          padding: "14px 24px",
          marginBottom: 36,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <p style={{ margin: 0, fontSize: 13.5, color: "#C4B891", lineHeight: 1.6 }}>
            <strong style={{ color: "#F5F0E8" }}>Objectif stratégique :</strong> Démystifier, rassurer, convertir.
            Chaque vidéo lève un frein précis et pousse vers une action mesurable — de la <span style={{ color: "#C9A84C" }}>notoriété</span> jusqu'au <span style={{ color: "#F0A050" }}>rendez-vous qualifié</span>.
            Cliquez sur une carte pour voir le storyboard complet.
          </p>
        </div>

        {/* Cards Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 20,
        }}>
          {concepts.map((c) => {
            const isHovered = hovered === c.id;
            const isSelected = selected === c.id;
            const tagStyle = tagStyles[c.tag] || {};
            return (
              <div
                key={c.id}
                onClick={() => setSelected(isSelected ? null : c.id)}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isSelected
                    ? "linear-gradient(145deg, rgba(201,168,76,0.12), rgba(45,74,62,0.12))"
                    : isHovered
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.025)",
                  border: isSelected
                    ? "1.5px solid rgba(201,168,76,0.6)"
                    : isHovered
                    ? "1.5px solid rgba(201,168,76,0.3)"
                    : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 16,
                  padding: "22px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  transform: isSelected ? "translateY(-3px)" : isHovered ? "translateY(-2px)" : "none",
                  boxShadow: isSelected
                    ? "0 12px 40px rgba(201,168,76,0.15)"
                    : isHovered
                    ? "0 8px 24px rgba(0,0,0,0.4)"
                    : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Card number watermark */}
                <div style={{
                  position: "absolute",
                  top: 12,
                  right: 16,
                  fontSize: 48,
                  fontFamily: "'Playfair Display', serif",
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.04)",
                  lineHeight: 1,
                  userSelect: "none",
                }}>
                  {String(c.id).padStart(2, "0")}
                </div>

                {/* Emoji & Tag */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontSize: 26 }}>{c.emoji}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    padding: "4px 10px",
                    borderRadius: 20,
                    background: tagStyle.bg,
                    border: `1px solid ${tagStyle.border}`,
                    color: tagStyle.text,
                  }}>
                    {c.tag}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{
                  margin: "0 0 10px",
                  fontSize: 15,
                  fontFamily: "'Playfair Display', serif",
                  fontWeight: 700,
                  lineHeight: 1.35,
                  color: "#F5F0E8",
                }}>
                  {c.titre}
                </h3>

                {/* Hook preview */}
                <p style={{
                  margin: "0 0 16px",
                  fontSize: 12,
                  color: "#8B9BAA",
                  lineHeight: 1.55,
                  fontStyle: "italic",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {c.hook}
                </p>

                {/* Angle badge */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 8,
                  marginBottom: 10,
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: tagStyle.text, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#6B7B8D" }}>{c.angle}</span>
                </div>

                {/* See detail hint */}
                <div style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: isSelected ? "#C9A84C" : "#44556A",
                  textAlign: "right",
                  letterSpacing: "0.08em",
                  transition: "color 0.2s",
                }}>
                  {isSelected ? "▲ Masquer le storyboard" : "▼ Voir le storyboard"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded Storyboard */}
        {selectedConcept && (
          <div style={{
            marginTop: 32,
            background: "linear-gradient(135deg, rgba(10,15,30,0.95), rgba(15,30,22,0.95))",
            border: "1.5px solid rgba(201,168,76,0.3)",
            borderRadius: 20,
            padding: "36px 32px",
            animation: "fadeIn 0.25s ease",
          }}>
            <style>{`
              @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
              <span style={{ fontSize: 36 }}>{selectedConcept.emoji}</span>
              <div>
                <div style={{ fontSize: 11, color: "#C9A84C", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
                  Concept #{selectedConcept.id} — Storyboard complet
                </div>
                <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: "clamp(18px, 2.5vw, 24px)", fontWeight: 700 }}>
                  {selectedConcept.titre}
                </h2>
              </div>
            </div>

            {/* 4-column storyboard */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}>
              {[
                {
                  label: "🎣 HOOK",
                  sublabel: "3 premières secondes",
                  content: selectedConcept.hook,
                  accent: "#C9A84C",
                  isQuote: true,
                },
                {
                  label: "📷 VISUEL",
                  sublabel: "Ce qu'on montre à l'écran",
                  content: selectedConcept.visuel,
                  accent: "#5DADE2",
                },
                {
                  label: "✍️ TEXTE DYNAMIQUE",
                  sublabel: "Supers & typographie",
                  content: null,
                  lines: selectedConcept.texteEcran,
                  accent: "#A98DD6",
                },
                {
                  label: "📣 CALL TO ACTION",
                  sublabel: "CTA de fin — mesurable",
                  content: selectedConcept.cta,
                  accent: "#5BBFA0",
                  isCTA: true,
                },
              ].map((col) => (
                <div key={col.label} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${col.accent}30`,
                  borderTop: `3px solid ${col.accent}`,
                  borderRadius: 12,
                  padding: "20px 18px",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: col.accent, marginBottom: 4 }}>
                    {col.label}
                  </div>
                  <div style={{ fontSize: 10, color: "#44556A", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {col.sublabel}
                  </div>
                  {col.lines ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {col.lines.map((line, i) => (
                        <div key={i} style={{
                          padding: "7px 12px",
                          background: "rgba(169,141,214,0.1)",
                          border: "1px solid rgba(169,141,214,0.2)",
                          borderRadius: 6,
                          fontSize: 13,
                          color: "#E8E0F5",
                          fontFamily: "'Inter Mono', monospace",
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : col.isCTA ? (
                    <div style={{
                      background: "linear-gradient(135deg, rgba(91,191,160,0.15), rgba(45,122,95,0.15))",
                      border: "1.5px solid rgba(91,191,160,0.35)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#5BBFA0",
                      textAlign: "center",
                    }}>
                      {col.content}
                    </div>
                  ) : (
                    <p style={{
                      margin: 0,
                      fontSize: col.isQuote ? 14 : 13,
                      color: col.isQuote ? "#F5F0E8" : "#A0ADB8",
                      lineHeight: 1.65,
                      fontStyle: col.isQuote ? "italic" : "normal",
                      borderLeft: col.isQuote ? `3px solid ${col.accent}` : "none",
                      paddingLeft: col.isQuote ? 12 : 0,
                    }}>
                      {col.content}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Angle & ROI bar */}
            <div style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              padding: "14px 20px",
              background: "rgba(201,168,76,0.06)",
              borderRadius: 10,
              border: "1px solid rgba(201,168,76,0.15)",
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6B7B8D" }}>Angle stratégique :</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#C9A84C" }}>{selectedConcept.angle}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#6B7B8D" }}>Objectif :</span>
                <span style={{
                  padding: "3px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  background: (tagStyles[selectedConcept.tag] || {}).bg,
                  border: `1px solid ${(tagStyles[selectedConcept.tag] || {}).border}`,
                  color: (tagStyles[selectedConcept.tag] || {}).text,
                }}>
                  {selectedConcept.tag}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer KPI section */}
        <div style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
        }}>
          {[
            { icon: "🔍", label: "Notoriété & Portée", count: "3 vidéos", desc: "Concepts 2, 5, 7 — éducation top of funnel", color: "#2D7A5F" },
            { icon: "💛", label: "Désir & Engagement", count: "3 vidéos", desc: "Concepts 1, 3, 6 — comparaison & différenciation", color: "#C9A84C" },
            { icon: "📞", label: "Conversion RDV", count: "2 vidéos", desc: "Concepts 4 & 8 — bottom of funnel, CTA direct", color: "#E67E22" },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: "rgba(255,255,255,0.025)",
              border: `1px solid ${kpi.color}30`,
              borderLeft: `3px solid ${kpi.color}`,
              borderRadius: 12,
              padding: "20px",
            }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{kpi.icon}</div>
              <div style={{ fontSize: 11, color: kpi.color, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 22, fontFamily: "'Playfair Display', serif", fontWeight: 700, marginBottom: 6, color: "#F5F0E8" }}>
                {kpi.count}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6B7B8D", lineHeight: 1.5 }}>{kpi.desc}</p>
            </div>
          ))}
        </div>

        {/* Sign-off */}
        <div style={{
          marginTop: 32,
          textAlign: "center",
          padding: "24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "#3A4A58", letterSpacing: "0.1em" }}>
            Stratégie préparée pour présentation client · Format Reels / TikTok / YouTube Shorts · 30–60 secondes par vidéo
          </p>
        </div>
      </div>
    </div>
  );
}
