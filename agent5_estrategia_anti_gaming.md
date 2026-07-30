# AGENTE #5 — ESTRATEGA DE PRODUCTO / EXPERTO EN ANTI-GAMING Y DETECCIÓN DE TENDENCIAS

> Terminal de Viralidad — Debate multi-agente
> Posición defendida: **el valor está en el "momento 0" (pre-burst), no en mostrar tendencias formadas. Sin `penalty(trash)` robusto, el sistema es un espejo de bots.**

---

## 1. RESUMEN EJECUTIVO

La "Terminal de Viralidad" propuesta tiene un algoritmo con la intención correcta (combinar velocidad, autores, entropía y calidad de origen) pero peca de ingenuo: **confunde "trending" con "tendencia emergente"**. Twitter Trending Topics ya muestra lo formado; nuestro producto justifica su existencia sólo si detecta lo que Twitter todavía no muestra. Defiendo tres pivotes estratégicos. **(1)** Reorganizar el score alrededor de la **pre-burst detection**: la transición `formándose → creciente` es donde está todo el valor monetizable (lead time de 30 min–6 h). **(2)** Convertir `penalty(trash)` en un **sub-sistema de primera clase** con features de coordinación bot, astroturfing y reciclado — sin esto, GameStop, Fyre Festival y cualquier hashtag político manipulado nos contaminan. **(3)** **Cross-validation multi-fuente** (Twitter + GDELT + Reddit + HN + Google Trends) como mecanismo bayesiano de legitimidad: narrativa que vive sólo en Twitter = sospechosa hasta prueba contraria. El algoritmo `S = 100 × (w1·z(v) + w2·norm(a) + w3·H(authors) + w4·origin_quality) × penalty(trash)` debe reformularse como **producto de probabilidades condicionales** (no suma ponderada ad-hoc) y agregar explícitamente una coordenada temporal `t` por narrativa, sin lo cual las 4 fases son indistinguibles. El killer feature no es "ver tendencias más rápido", sino **"ver tendencias que todavía no existen en Twitter, pero cuyos precursores ya están en GDELT/Reddit"**. Eso vende a periodistas, OSINT, traders y analistas políticos — cuatro ICPs con workflows distintos pero misma necesidad: **lead time accionable con confianza calibrada.**

---

## 2. MODELO DE 4 FASES — definición matemática y cualitativa

### 2.1 Variables base por narrativa `n` en ventana `Δt`
- `v(n,Δt)` = velocidad = `mentions(n,Δt) / |Δt|`
- `a(n,Δt)` = aceleración = `dv/dt` (segunda derivada del volumen)
- `A(n,Δt)` = set de autores únicos activos
- `H(authors)` = entropía de Shannon sobre la distribución de menciones por autor (proxy de dispersión)
- `D(n)` = dispersión de comunidades = cantidad de clusters/louvain communities que mencionan `n`
- `quality(n)` = score de origen (ver §6)
- `trash(n)` = score anti-gaming (ver §4)

### 2.2 Definición de cada fase (umbrales orientativos, calibrables)

| Fase | `v` (relativa a baseline 7d) | `a` | `H(authors)` | `D` | `origin_quality` | Duración típica |
|------|------------------------------|-----|--------------|-----|------------------|-----------------|
| **Formándose** | 0.1–1.0× | débil pero **>0 y creciente** | baja pero creciente (autores concentrados pero añadiendo) | 1–3 comunidades | ALTA (cuentas con historia previa en el tema) | 2 h – 48 h |
| **Creciente** | 1.0–5× | **alta y positiva** (a > 0.5·σ_v) | creciente rápidamente | 3–10 comunidades | media-alta | 30 min – 6 h |
| **Formada** | >5× → estabiliza | ~0 o ligeramente negativa | alta y saturada | >10 comunidades | indiferente (ya amplificado) | 6 h – 72 h |
| **Decaída** | decreciente | **negativa sostenida** | alta pero autores activos en descenso | dispersión estable o en contracción | — | variable (horas–semanas) |

### 2.3 Transiciones críticas

- **`formándose → creciente` (EL MOMENTO CRÍTICO)**: se dispara cuando se cumplen **simultáneamente**:
  1. `a(n,Δt) > 0.5·σ_v(n)` (aceleración anómala respecto al histórico)
  2. `ΔD(n,Δt) ≥ 2` (aparece pickup en ≥2 comunidades nuevas)
  3. `H(authors)` cruzó percentil 40 de su distribución histórica
  4. `origin_quality(initiator) > 0.5` Y `trash(n) < 0.4`
  - **Lead time accionable:** 30 min – 4 h antes del burst público. **Esto es lo que vendemos.**

- **`creciente → formada`**: cuando `a → 0` Y `v > 5×baseline`. Aquí deja de haber alpha, sólo ruido ya explotado.

- **`formada → decaída`**: `a < -0.3·σ_v` sostenido 2 ventanas consecutivas + abandono de autores top-20% (>30% dejan de postear).

### 2.4 Crítica al score propuesto

El score original `S = 100·(w1·z(v) + w2·norm(a) + w3·H + w4·origin_quality)·penalty` **no tiene coordenada temporal por narrativa**, lo cual hace imposible distinguir las 4 fases (todas comparten el mismo `S`). Propuesta de reformulación:

```
phase(n) = argmax_phase [ P(phase | v_t, a_t, H_t, D_t, quality, trash) ]
S(n) = P(creciente | features) · (1 − trash(n)) · origin_quality(n)   ← valor de "oportunidad"
```

Es decir: el score debe reflejar **probabilidad de estar en transición a `creciente`**, no magnitud de la señal. Una narrativa en `formada` con `v=100×baseline` tendría `S` alto en la fórmula original pero **bajo valor accionable** (llegaste tarde).

---

## 3. WEAK SIGNALS / PRE-BURST DETECTION

### 3.1 Filosofía: "weakly-coupled early indicators"
Las señales fuertes en Twitter son tarde. Hay que monitorear señales **débilmente acopladas** que tienden a preceder 1–24 h al burst:

### 3.2 Features de pre-burst

| Feature | Fuente | Lógica | Falsos positivos típicos |
|---------|--------|--------|--------------------------|
| **Mención de cuentas de alta autoridad que aún NO viralizaron** | Twitter API | Un autor con PageRank alto menciona el tópico; su audiencia aún no amplificó | autor tier-1 hablando de meme sin intención viral |
| **Cross-pollination entre comunidades** | Twitter + Reddit | Mismo tópico aparece en 2+ clusters de Louvain previamente disjuntos | trend auténticamente cross-domain |
| **Pickup por GDELT antes que Twitter** | GDELT 2.0 | Aparición en eventos GDELT sin correlato Twitter → prensa local/fuentes tradicionales lo tomaron primero | evento hyper-local sin relevancia |
| **Crecimiento anómalo en nichos de Reddit** | Reddit API (Pushshift altenativo) | Subreddit pequeño con delta >5× de posts sobre el tema en 6 h | brigading de subreddit |
| **Cuentas "canario" activadas** | Lista curada manualmente | Early adopters conocidos (investigadores, journalists, traders expertos) postean sobre el tema | posteo casual |
| **Search volume anómalo en Google Trends** | Google Trends API (no oficial) | Delta >2× en query relacionada sin viralidad Twitter | efecto estacional |
| **Pickup en Hacker News** | Algolia HN API | Mención en front page o comentario con score >50 | contenido tech-niche sin crossover |
| **Spike en URLs compartidas con dominio específico** | Twitter + GDELT | Mismo dominio aparece en >5 posts únicos en 30 min | prensa legítima |
| **Network bridging** | Twitter graph | Un nodo puente entre 2 communities empieza a postear tópico nuevo | coincidencia |
| **Sentiment shift súbito** | NLP (RoBERTa sent-multiling) | Cambio >0.3 en sentimiento promedio en ventana 1 h | evento real |

### 3.3 Estrategia anti-falso-positivo
- **Requerir ≥2 señales débilmente acopladas** de fuentes distintas para disparar alerta "formándose".
- **Decaimiento temporal**: una señal sola pierde peso a las 6 h si no se confirma.
- **Bayesian updating**: cada fuente aporta likelihood ratio; posterior >0.7 = "formándose" confirmado.

### 3.4 Caso real: Fyre Festival (2017)
- 2 semanas antes: festivales de música en Bahamas + Instagram influencers ya activos (señal canario).
- 5 días antes: first Reddit thread en r/festivals con quejas logísticas (cross-pollination).
- 48 h antes: GDELT recoge primera nota de prensa local sobre problemas organizativos.
- **Lead time posible: ~48 h.** Twitter Trending mostró el desastre cuando ya era obvio.

### 3.5 Caso real: GameStop/AMC (enero 2021)
- Diciembre 2020: r/wallstreetbets ya postea sobre GME con cadencia creciente (señal Reddit).
- Primer pickup Twitter: ~10 días antes del burst por cuentas financieras indie (cuentas canario).
- GDELT: primera mención mainstream ~3 días antes.
- **Lead time posible: 5–10 días** — suficiente para traders.

---

## 4. ANTI-GAMING MODEL — `penalty(trash)` como sub-sistema de primera clase

### 4.1 Taxonomía de amenazas

| Amenaza | Descripción | Caso real |
|---------|-------------|-----------|
| **Bot campaign coordinado** | Red de bots posting en ventanas sincronizadas | Macedonios en 2016 US election |
| **Astroturfing** | Actividad fabricada para parecer grass-roots | Russia IRA, hashtags #WalkAway |
| **Manipulación pagada** | Compra de retweets/likes/menciones | "Influencer" pagado, Fyre promo |
| **Spam promocional** | Mismo contenido reciclado masivamente | Crypto shill accounts |
| **Recycled content** | Copypasta de noticias viejas como nuevas | Fake news elections |
| **Hashtag hijacking** | Toma de hashtag existente para inyectar narrativa | #MeToo hijack attempts |
| **Coordinated inauthentic behavior (CIB)** | Coordinated networks removidas por Twitter | Facebook/Twitter integrity reports |

### 4.2 Features de detección (vector de input)

```
features(n, Δt) = [
    # Account metadata
    account_age_distribution,          # media y std de edad de cuentas que mencionan
    new_account_ratio,                 # % cuentas <30 días
    profile_completeness_mean,         # avg de bio+pic+header
    follower_following_ratio_skew,     # distribuciones raras
    
    # Behavioral
    posting_cadence_anomaly,           # KS-test vs histórico de la cuenta
    synchronized_posting_ratio,        # % posts en ventanas <60 s entre sí
    burst_entropy,                     # entropía de timestamps (baja = bot)
    url_shortener_ratio,               # bit.ly, tinyurl, etc.
    duplicate_content_ratio,           # SimHash ≥0.95 sobre texto
    
    # Network
    network_density_among_posters,     # densidad del subgrafo de quienes mencionan
    mutual_mention_ratio,              # cuánto se mencionan entre sí (coordination)
    louvain_cluster_concentration,     # 1 cluster = sospechoso
    
    # Content
    sentiment_uniformity,              # std baja = copia coordinada
    hashtag_jaccard_mean,              # similitud de hashtags entre posts
    media_hash_duplicate_ratio,        # misma imagen/video compartido
    language_distribution_skew,        # muchos accounts claim EN pero postan ES/ru
    
    # Temporal
    hour_of_day_uniformity,            # posting 24/7 = bot
    timezone_inconsistency,            # tz declarada vs tz de posting
    
    # External
    gdelt_match_score,                 # vs GDELT events en 1-2h
    reddit_match_score,                # vs Reddit threads
    google_trends_match_score
]
```

### 4.3 Algoritmo: stack en 3 capas

#### Capa 1 — Heurísticas deterministas (rápidas, alta precision baja recall)
```python
def heuristic_trash_score(features):
    flags = []
    if features['new_account_ratio'] > 0.4:
        flags.append(('new_accounts', 0.3))
    if features['synchronized_posting_ratio'] > 0.2:
        flags.append(('sync_posting', 0.4))
    if features['duplicate_content_ratio'] > 0.3:
        flags.append(('dup_content', 0.4))
    if features['network_density_among_posters'] > 0.7 and features['louvain_cluster_concentration'] > 0.85:
        flags.append(('coordinated_cluster', 0.5))
    if features['sentiment_uniformity'] < 0.05 and features['hashtag_jaccard_mean'] > 0.7:
        flags.append(('copy_paste_campaign', 0.4))
    if features['hour_of_day_uniformity'] < 0.1:
        flags.append(('non_human_cadence', 0.3))
    if features['url_shortener_ratio'] > 0.5:
        flags.append(('spammy_urls', 0.2))
    if features['media_hash_duplicate_ratio'] > 0.4:
        flags.append(('media_recycle', 0.3))
    
    score = 1 - prod(1 - w for _, w in flags)  # 0 = limpio, 1 = basura
    return min(score, 1.0), flags
```

#### Capa 2 — Isolation Forest (anomalía no supervisada, ~50 ms inference)
Entrenado **por semana** sobre features agregados de narrativas etiquetadas manualmente como legítimas. Score de anomalía >0.7 → trash.

#### Capa 3 — GNN (Graph Neural Network) sobre grafo de interacción
Nodos = accounts, edges = menciones/retweets en ventana 6 h. Etiquetas: cuentas ya confirmadas como bots por Twitter integrity reports (dataset público). Modelo: GraphSAGE 2 capas + MLP. Score de probabilidad de bot por nodo → agregación a nivel narrativa.

### 4.4 Combinación y calibración
```
trash(n) = 0.4·heuristic + 0.3·isolation_forest + 0.3·gnn_aggregate
```
Re-entrenar quincenalmente con feedback de moderadores humanos (cuentas flag-eadas → etiquetadas → dataset).

### 4.5 Umbrales recomendados
- `trash(n) < 0.3` → narrativa legítima, sin penalty
- `0.3 ≤ trash < 0.6` → flag de atención (mostrar con badge "anómalo")
- `trash ≥ 0.6` → ocultar del feed principal, enviar a cola de revisión

---

## 5. CROSS-VALIDATION MATRIX

Matriz fuente × señal detectable × nivel de confianza base (calibrar con histórico):

| Fuente | Latencia vs Twitter burst | Señal que detecta | Confianza base | Peso en Bayesian |
|--------|---------------------------|--------------------|---------------|------------------|
| **Twitter API** | 0 (referencia) | volumen, autores, sentimiento | 0.5 (contaminable) | 0.3 |
| **GDELT 2.0** | 1–24 h antes (a veces) | pickup prensa local/global, eventos geopolíticos | 0.85 | 0.3 |
| **Reddit** (subreddits nicho) | 2–48 h antes | discusión profunda, quejas, filtraciones | 0.75 | 0.2 |
| **Hacker News** | 6–48 h antes | temas tech, startups, seguridad | 0.8 | 0.1 |
| **Google Trends** | 1–12 h antes | interés de búsqueda general | 0.6 | 0.1 |

### 5.1 Reglas de cross-validation

```python
def legitimacy(narrative):
    sources = {twitter: bool, gdelt: bool, reddit: bool, hn: bool, g_trends: bool}
    trash_score = compute_trash(narrative)
    
    if sources.twitter and (sources.gdelt or sources.reddit) and trash_score < 0.4:
        return 'LEGIT', 0.92
    if sources.twitter and not (sources.gdelt or sources.reddit) and trash_score > 0.5:
        return 'BOT_CAMPAIGN', 0.85
    if sources.twitter and not (sources.gdelt or sources.reddit) and trash_score < 0.4:
        return 'TWITTER_NATIVE', 0.55   # rumours, memes
    if (sources.gdelt or sources.reddit) and not sources.twitter:
        return 'PRE_BURST', 0.7          # ★ esto es lo que queremos detectar ★
    if not sources.twitter and not sources.gdelt and not sources.reddit:
        return 'NOISE', 0.2
    return 'UNCERTAIN', 0.5
```

### 5.2 Caso real: Cambridge Analytica (2018)
- **GDELT**: pickup de Guardian/Obsolver artículos desde **diciembre 2015** ( freezer story).
- **Reddit**: r/technology y r/politics discusiones esporádicas **2016–2017**.
- **Twitter**: burst viral sólo tras **Cambridge Analytica whistleblower Channel 4 video marzo 2018**.
- **Lead time posible: >2 años** si hubiéramos monitoreado GDELT+Reddit como pre-burst.

---

## 6. ORIGIN QUALITY SCORE

El `origin_quality` propuesto ("PageRank del primero") es insuficiente. Propuesta:

### 6.1 Fórmula
```
origin_quality(initiator) = 0.25·history_in_topic 
                          + 0.20·engagement_quality 
                          + 0.20·network_position 
                          + 0.15·account_authenticity 
                          + 0.10·temporal_priority 
                          + 0.10·cross_source_corroboration
```

### 6.2 Features

| Componente | Cálculo | Rango |
|------------|---------|-------|
| `history_in_topic` | % de posts históricos del iniciador sobre el mismo tema (últimos 90d) — cubre "¿tenía historial o apareció de la nada?" | 0–1 |
| `engagement_quality` | ratio (engagement / followers) normalizado, con peso a replies>likes (vs inverso) | 0–1 |
| `network_position` | PageRank + betweenness centrality en grafo de interacción del tema | 0–1 |
| `account_authenticity` | 1 − bot_probability(GNN), edad cuenta, perfil completo, historial 90d | 0–1 |
| `temporal_priority` | 1 si es verdadero primer post público (no recycled), 0 si ya existía anterior | 0–1 |
| `cross_source_corroboration` | aparece en GDELT/Reddit con timestamp cercano | 0–1 |

### 6.3 Caso ilustrativo: hashtag político #X
- **Escenario A**: iniciador = periodista de medios con 5 años post sobre tema → `origin_quality = 0.85`.
- **Escenario B**: iniciador = cuenta nueva con 3 posts, 12k followers pero 0 engagement → `origin_quality = 0.10` → narrativa queda relegada hasta corroboración.

### 6.4 Caso real: bots macedonios 2016
Cuentas "políticas" creadas 3–6 meses antes de la elección, posteo intenso sobre polarización. `history_in_topic = 0.1` (cuenta joven), `account_authenticity < 0.3`, `engagement_quality` alto sólo por retweet de red → `origin_quality ≈ 0.18` → correcto penalization.

---

## 7. CASOS DE USO — 5 workflows concretos

### 7.1 Periodista investigativo
**Trigger**: quiere encontrar "qué se está hablando antes de que sea noticia".
1. **Configura** watchlist de tópicos (corrupción, política local, finanzas) + cuentas canario (otros periodistas, whistleblowers, fuentes filtradoras).
2. **Dashboard muestra** narrativas en fase `formándose` con `legitimacy=PRE_BURST` o `LEGIT`.
3. Filtra por `origin_quality > 0.6` y `trash < 0.3`.
4. Click en narrativa → **timeline multi-fuente** (primer tweet + primer thread Reddit + primer evento GDELT + Google Trends sparkline).
5. Botón **"Investigar"** → exporta a Notion/Obsidian con: grafo de difusión, lista de cuentas amplificadoras top-20, diferencias temporales entre fuentes.
6. Alerta push cuando una narrativa de su watchlist hace transición `formándose → creciente`.
**Métrica de valor**: # de artículos publicados con exclusiva >24 h antes que medios mainstream.

### 7.2 Trader de cripto
**Trigger**: necesita detectar narrativas sobre tokens/protocolos antes de pump.
1. **Watchlist**: tickers, handles de devs, cuentas canario (crypto researchers en CT), subreddits (r/cryptocurrency, r/cryptomoonshots, r/ethtrader).
2. Dashboard **filtra por cross-validation**: requiere `GDELT match` o `Reddit match` (filtra puro-shill).
3. `trash < 0.4` para excluir bots de pump-and-dump coordinados.
4. Para cada token: muestra curva de menciones + sentiment + primera cuenta que mencionó + score de "freshness" (cuánto hace que se rompió el silencio).
5. Alerta cuando `delta_v > 3×baseline` Y `legitimacy=LEGIT`.
6. Integración opcional: webhook a exchange/bot de trading.
**Métrica de valor**: lead time antes del pump >2 h, Sharpe ratio de operaciones informadas.

### 7.3 Analista de marca
**Trigger**: detectar crisis emergente o opportunity de marketing real-time.
1. **Watchlist**: nombre de marca, productos, competidores, keywords de industria.
2. Dashboard filtra por `trash < 0.4` (excluir quejas spam coordinadas) y `origin_quality > 0.4`.
3. Para crisis: muestra narrativas en `creciente` con sentiment negativo + cuenta originaria +增速 top amplificadores.
4. Para opportunity: detecta menciones positivas cross-comunidad (potencial UGC amplification).
5. Alerta Slack/Teams cuando sentiment_shift > 0.3 o cuando `cross-pollination` a comunidades nuevas.
6. Reporte semanal: top 10 narrativas de marca por lead time vs mainstream.
**Métrica de valor**: tiempo medio de respuesta a crisis (MTTR) reducido >50%.

### 7.4 OSINT researcher
**Trigger**: detectar eventos geopolíticos, conflictos, movimientos militares antes de prensa.
1. **Watchlist**: regiones, líderes, conflictos, fuentes Telegram multilingües + Twitter + GDELT.
2. Cross-validation **exige GDELT** + (Twitter OR Reddit). Sin GDELT → no es evento, es ruido.
3. Filtro `account_authenticity > 0.7` (excluir cuentas propagandísticas estatales).
4. Mapa geográfico de menciones + timeline multilingüe.
5. Botón "Export to i2/Maltego" para análisis de red.
6. Alerta cuando: nuevo evento GDELT + pickup Twitter <1 h + trash <0.3 = posible evento real en desarrollo.
**Métrica de valor**: detección de evento geopolítico antes de medios mainstream >2 h.

### 7.5 Analista político
**Trigger**: detectar narrativas políticas, manipulation electoral, polling shifts.
1. **Watchlist**: candidatos, hashtags políticos, issues (impuestos, migración), cuentas de partidos.
2. **Detección de bot campaigns**: sub-tablero con `trash > 0.5`, muestra clusters coordinados, cuentas probablemente bots, narrativas inyectadas.
3. Cross-validation con GDELT (prensa) + Google Trends (interés público).
4. Para cada narrativa: `legitimacy` badge (LEGIT / BOT_CAMPAIGN / TWITTER_NATIVE).
5. Reporte diario: "top 5 narrativas inyectadas por redes coordinadas".
6. Mapa de difusión con clusters identificados.
**Métrica de valor**: % de bot campaigns detectadas antes de remoción por plataforma (benchmark vs Twitter integrity reports).

---

## 8. ALERTAS — reglas, umbrales, canales, anti-fatigue

### 8.1 Cuándo alertar
- **CRÍTICO**: narrativa de watchlist personal transita `formándose → creciente` con `legitimacy=LEGIT` Y `trash<0.3`. **Lead time máximo**.
- **ALTO**: narrativa nueva (no en watchlist) con `cross_source ≥ 2` y `origin_quality>0.7` y `trash<0.3`.
- **MEDIO**: narrativa con `legitimacy=PRE_BURST` (GDELT/Reddit sin Twitter) → opportunity de "first to break".
- **INFO**: cambio de fase para narrativas ya seguidas.
- **WARNING**: narrativa con `trash>0.5` pero volumen alto → "posible operación de manipulation detectada".

### 8.2 Anti-fatigue
- **Rate limiting por usuario**: max 10 alertas críticas/día, 20 altas/día.
- **Agrupar** narrativas similares (SimHash + clustering semántico) en una sola alerta con "5 narrativas relacionadas".
- **Cooldown**: misma narrativa no alerta más de 1 vez cada 2 h salvo transición de fase.
- **Snooze inteligente**: usuario marca "no me interesa" → modelo de preferencias evita similares.
- **Canal adaptativo**: críticas = push + email; altas = push; info = digest diario.

### 8.3 Canales soportados
- Push (app/web)
- Email
- Slack/Teams/Discord webhook
- Webhook genérico (para integraciones de trading/automation)
- RSS/Atom feed
- SMS (sólo críticas, premium tier)

---

## 9. DIFERENCIADORES — 5 killer features vs Twitter Trending

### 9.1 **Lead time** (no copia, adelanta)
Twitter Trending muestra lo **ya formado**. Nosotros mostramos lo `formándose` 30 min–48 h antes, combinando GDELT/Reddit/Google Trends como señales precursoras. **Killer feature #1.**

### 9.2 **Anti-gaming transparente**
Cada narrativa muestra un badge: `LEGIT`, `BOT_CAMPAIGN`, `TWITTER_NATIVE`, `PRE_BURST`. Twitter no te dice cuándo un trending está manipulado. Nosotros sí. **Killer feature #2.**

### 9.3 **Cross-source corroboration visible**
Timeline que muestra **cuándo y dónde** apareció primero la narrativa (Twitter, GDELT, Reddit) — no sólo "está trending". **Killer feature #3.**

### 9.4 **Workflow curado por rol**
Twitter Trending es para todos. Nosotros tenemos dashboards específicos para periodista, trader, marca, OSINT, analista político — cada uno con filtros y métricas relevantes. **Killer feature #4.**

### 9.5 **Origin attribution**
Cada narrativa muestra quién la inició, su score de autenticidad, su historial en el tema, y el grafo de difusión. Twitter muestra "trending" sin contexto. **Killer feature #5.**

---

## 10. ROADMAP — MVP / v1 / v2

### 10.1 MVP (semanas 1–4) — "lo mínimo para demostrar lead time"
**Objetivo**: probar que detectamos narrativas antes que Twitter Trending.

- **Ingesta**: Twitter API v2 (filtered stream) + GDELT 2.0 (events API) + Reddit API (subreddits curados).
- **Pipeline**: ingest → normalize → cluster narrativo (TF-IDF + DBSCAN) → score simple (v, a, H) → 4 fases.
- **Heurísticas anti-gaming** (capa 1 de §4.3): 8 reglas deterministas.
- **Dashboard web**: lista de narrativas con fase, score, fuentes, badge de legitimacy.
- **Alertas**: email + webhook, 3 niveles.
- **1 workflow completo**: OSINT researcher (el más fácil de validar).
- **Métrica interna**: medir lead time vs Twitter Trending en 100 narrativas.

**No entra en MVP**: GNN, dashboards multi-rol, integraciones de exchange, multi-idioma profundo.

### 10.2 v1 (meses 2–3) — "multi-rol y anti-gaming serio"
- **Isolation Forest** + dataset etiquetado para re-entrenamiento.
- **GNN** (GraphSAGE) para bot detection por grafo de interacción.
- **Cross-validation bayesiana** completa con 5 fuentes.
- **5 dashboards multi-rol** (periodista, trader, marca, OSINT, político).
- **Origin quality score** completo (6 componentes).
- **Alertas multi-canal** (Slack/Teams/Discord/SMS).
- **API pública** para integraciones.
- **Pricing tiers**: free (5 alertas/día), pro, enterprise.

### 10.3 v2 (meses 4–6) — "intelligence platform"
- **Multi-idioma** (ES, EN, PT, FR, DE, RU, ZH) con NLP nativo.
- **Telegram/BlueSky/Mastodon** ingestion.
- **Predictive modeling**: LSTM/Transformer para predecir fase futura (formada vs decaída en 6 h).
- **Anomaly discovery**: detectar narrativas que aún no existen pero cuyo "espacio semántico" está activo (anomaly detection sobre embedding space).
- **Graph exploration UI**: Maltego-like, drag-and-drop investigation.
- **Marketplace de watchlists**: expertos curan y venden watchlists temáticas.
- **White-label**: para agencias de intelligence y PR.

---

## 11. ÉTICA Y LEGALIDAD

### 11.1 Riesgos

| Riesgo | Severidad | Detalle |
|--------|-----------|---------|
| **Scraping de Twitter** | ALTO | ToS de Twitter prohíbe scraping. API v2 con tier pago es la vía legítima. |
| **GDPR — datos personales** | ALTO | Cuentas de usuarios son datos personales en UE. Indexar perfiles y mostrarlos requiere base legal. |
| **CCPA / California** | MEDIO | Similar a GDPR en scope. |
| **Difamación por false-positive bot** | ALTO | Marcar a un usuario como "bot" sin evidencia sólida → demanda. |
| **Contenido de terceros** | MEDIO | Mostrar tweets y posts requiere atribución y respeto a ToS. |
| **Manipulación por parte de usuarios** | MEDIO | Adversarios podrían intentar "gaming the anti-gaming" (model extraction, adversarial features). |
| **Sesgo del modelo anti-gaming** | MEDIO | Falsos positivos contra cuentas minoritarias o no-inglés hablantes. |
| **Uso malicioso por clientes** | MEDIO | Estados autoritarios usando la tool para cazar disidentes. |

### 11.2 Mitigaciones

1. **Usar sólo APIs oficiales** (Twitter API v2, Reddit API, GDELT, Google Trends no oficial con rate-limit conservador). No scraping.
2. **Anonimización parcial**: mostrar handles pero no IDs internos; ofrecer opt-out para usuarios (formulario público "no quiero ser analizado").
3. **Bot badge con disclaimer**: "modelo probabilístico, no afirmación de hecho". Score + bandera de incertidumbre.
4. **Auditoría de sesgos** trimestral sobre datasets etiquetados, con métricas por idioma y por tipo de cuenta.
5. **Términos de servicio restrictivos**: prohibir uso para surveillance estatal no-democrática; cláusula de revocación.
6. **DPA / DPIA**: registro de actividades de tratamiento GDPR, designación de DPO si >UE users.
7. **Transparencia metodológica**: paper técnico público sobre cómo funciona el anti-gaming (accountability).
8. **Rate-limit y human-in-the-loop**: ninguna acción automática contra cuentas (sólo scoring); moderación humana para tags públicos.

---

## 12. MÉTRICAS DE ÉXITO DEL PRODUCTO

| Métrica | Definición | Target MVP | Target v1 |
|---------|------------|-----------|-----------|
| **Lead time medio** | Tiempo entre detección de `formándose` y detección de `formada` (Twitter Trending) | >1 h en 50% de casos | >3 h en 70% |
| **Precision (LEGIT)** | De narrativas marcadas LEGIT, cuántas realmente lo eran | >0.8 | >0.9 |
| **Recall (BOT_CAMPAIGN)** | De campañas de bots removidas por Twitter, cuántas detectamos antes | n/a | >0.6 |
| **False-positive bot rate** | Cuentas legítimas marcadas como bot | <5% | <2% |
| **NPS** | Net promoter score por rol | — | >40 |
| **Daily Active Watchlists** | Watchlists activas por día | — | >500 |
| **Time-to-insight** | Tiempo desde que usuario abre dashboard hasta que toma acción | <5 min | <2 min |
| **Conversion free → pro** | % usuarios free que pasan a pro | — | >5% |
| **Churn mensual** | % usuarios pro que cancelan | — | <5% |

### 12.1 Métrica North Star
**"Lead time accionable medio"** = tiempo entre nuestra alerta y el burst público, ponderado por precision. Si sube, ganamos. Si baja, somos un clon caro de Twitter Trending.

---

## 13. PREGUNTAS PARA OTROS AGENTES

### 13.1 → Agente #1 (Arquitecto de Datos)
**Pregunta**: ¿El pipeline de ingesta puede mantener latencia <5 min entre evento y score disponible? El `penalty(trash)` con GNN requiere construir el grafo de interacción en ventana rodante 6 h — ¿es viable en tiempo real con presupuesto de costos razonable? ¿Podemos particionar el grafo por narrativa sin perder edges cross-narrativa?

### 13.2 → Agente #3 (Backend / Scoring)
**Pregunta**: ¿Podemos reformular el score como **producto de probabilidades condicionales** en vez de suma ponderada (como propone el estratega)? Necesitamos también que el score incluya coordenada temporal `t` por narrativa — ¿cómo se almacena y consulta eficientemente? ¿El Isolation Forest en capa 2 puede inferir en <50 ms por narrativa?

### 13.3 → Agente #2 (Frontend / UX)
**Pregunta**: ¿Cómo representamos visualmente las 4 fases + el badge de `legitimacy` (LEGIT / BOT_CAMPAIGN / TWITTER_NATIVE / PRE_BURST) sin saturar el dashboard? ¿Mostramos `trash` score visible al usuario o lo ocultamos tras el badge? Para 5 roles distintos, ¿un solo dashboard configurable o 5 dashboards separados?

---

## 14. POSTURA FINAL — para el debate

1. **El algoritmo original es ingenuo**: suma ponderada de `v, a, H, origin_quality` no distingue fases ni detecta pre-burst. Hay que reformular con **probabilidades por fase** + coordenada temporal + cross-validation bayesiana.
2. **`penalty(trash)` debe ser sub-sistema de primera clase**: 3 capas (heurísticas + Isolation Forest + GNN), con re-entrenamiento continuo. Sin esto, el sistema replica manipulation de bots.
3. **El killer feature es lead time + legitimacy badge + cross-source attribution**: no "ver tendencias más rápido", sino "ver tendencias que aún no están en Twitter con confianza calibrada".
4. **El modelo de negocio es B2B multi-ICP**: 5 roles con workflows distintos. Free tier como lead magnet, pro/enterprise con SaaS pricing.
5. **MVP en 4 semanas** demuestra el lead time; v1 en 3 meses cierra anti-gaming y multi-rol; v2 en 6 meses es intelligence platform.
6. **Ética**: APIs oficiales, opt-out, bot badge con disclaimer, auditoría de sesgos, TOS restrictivos.

**Sin mi propuesta, el producto es un clon caro de Twitter Trending. Con mi propuesta, es una herramienta de intelligence con lead time accionable.**

