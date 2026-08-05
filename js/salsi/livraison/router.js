/* salsi/livraison · router.js — routage Salsi (livraisonRoute), câblage window.salsiLiv & init (chargé dernier). */

'use strict';

  var OTHER = /\bdora\b|\bscore\b|\bbadge|\bbus factor|\bsecu|\bsecurite|\brepo\b|\bmaturite|\bflag|\bfeature flag|\bdaily|\bpriorite|\bbilan\b/;

  S.livraisonRoute = async function livraisonRoute(n, q) {
    var explicitIid = parseIid(n);
    var iid = explicitIid || lastMr;           // ← mémoire de contexte
    var branch = parseBranch(q);
    var hasRef = /\bmr\b|\bmerge request\b|\bla\b|\ble\b|\bca\b|\bcelle|\bcette|\-la\b/.test(n) || explicitIid || lastMr;

    // ── CRÉER UNE BRANCHE : « crée une branche feature/x depuis main » (base selon le flow)
    if (/\bbranche\b/.test(n) && /\b(cree[rz]?|creer|nouvelle branche|fais( moi)? (une )?branche|branche moi|demarre[rz]? une branche|ajoute[rz]? une branche|part(ir|s)? sur une branche|je veux (creer )?une branche|il me faut une branche|besoin d une branche|peux tu (creer|faire) une branche|ouvre une branche)\b/.test(n) && !OTHER.test(n)) {
      var pb = parseNewBranch(q);
      var base = pb.base;
      if (!base && /gitflow|git flow|\bdevelop/.test(n)) base = 'develop';
      if (!base && /\btrunk\b/.test(n)) base = null; // → branche par défaut dans le handler
      return await doCreateBranch(pb.name, base);
    }
    // ── LISTER LES BRANCHES : « j'ai quoi comme branche », « quelles branches », « mes branches »
    if (/\bbranches?\b/.test(n) && !OTHER.test(n)
      && !/\bmorte|stale|obsolete|vieille|dead|inactive|nettoy|supprim|purge|protege|pousse|merge(e|es)? non/.test(n)
      && /\b(j ai quoi comme branche|quoi comme branches?|quelle?s? branches?|mes branches|liste (des |les )?branches|montre (moi )?(les )?branches|branches (du repo|dispo|dispos|existantes|ouvertes)|toutes les branches|il y a quoi comme branche)\b/.test(n)) {
      return await listBranches();
    }

    // ── ARRÊTER la surveillance (avant « surveiller », sinon « arrête de surveiller » l'active)
    if (/\b(arrete[rz]?|stop|ne (me )?previens? plus|laisse tomber la surveillance)\b/.test(n) && /surveil|previen|notif|watch/.test(n)) {
      stopWatchAll();
      return { html: '🔕 Ok, j\'arrête de surveiller les MR. Dis « surveille la 48 » quand tu veux relancer.', intent: 'liv_watch' };
    }
    // ── SURVEILLER : « préviens-moi quand la 48 est validée », « surveille la 48 »
    if (/\b(surveille[rz]?|previen(s|ds)? moi|notifie moi|tiens moi au courant|dis moi quand|previens moi quand|watch)\b/.test(n)
      && !/\barrete[rz]?\b|\bstop\b|ne (me )?previens? plus/.test(n)
      && (/\b(valid|approu|prete|mergeable|livr|mr)\b/.test(n) || explicitIid) && !OTHER.test(n)) {
      var iidW = explicitIid || lastMr;
      if (!iidW) return { html: 'Quelle MR je surveille ? « surveille la <b>48</b> » — je te préviens dès qu\'elle est approuvée. 🔔', intent: 'liv_watch' };
      setLast(iidW);
      var mrW = await glJson(ctx(), '/projects/' + (ctx().pid) + '/merge_requests/' + iidW);
      var ok = startWatch(iidW, mrW && mrW.title);
      return { html: ok ? '🔔 OK — je surveille <b>!' + iidW + '</b> et je te préviens dès qu\'elle est approuvée pour livrer.' : '⚠️ Impossible de surveiller (repo/auth ?).', intent: 'liv_watch' };
    }

    // ── COMMENTER : « commente la 44 : … », « réponds : … », « commente-la : … »
    if (/\bcommente(r)?\b|\bcommentaire\b|\breponds?\b|\bajoute un (mot|commentaire)\b/.test(n)) {
      var body = q.split(/[:：]/).slice(1).join(':').trim();
      if (iid && body) { setLast(iid); return await doComment(iid, body); }
      if (iid) return { html: 'Quel commentaire pour <b>!' + iid + '</b> ? Dis « commente : ton message ». 💬', intent: 'liv_comment' };
      return { html: 'Sur quelle MR ? « commente la <b>44</b> : ton message ». 💬', intent: 'liv_comment' };
    }

    // ── QUI DOIT VALIDER : « qui doit valider la 44 ? », « qui peut approuver ? », « il manque quoi ? »
    if (/(qui).*(valid|approu|doit merger|peut merger)|combien d approbation|il manque.*(validation|approbation)|c est valide|est ce (que c est )?valide|est ce approuve/.test(n) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await whoApproves(iid); }
      return { html: 'De quelle MR parle-t-on ? « qui doit valider la <b>44</b> ? » 🌱', intent: 'liv_who' };
    }

    // ── APPROUVER : « approuve la 44 », « valide-la », « je valide », « ok pour la 44 », « feu vert »
    if ((/\bapprouv(e|er|ee)?\b|\bje valide\b|\bok pour\b|\bfeu vert\b|\bvalide[rz]?[- ]?(la|le|ca|cette mr)\b|\bvalide[rz]? (la )?mr\b/.test(n))
      && !/\bqui\b/.test(n) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await doApprove(iid); }
      return { html: 'Quelle MR j\'approuve ? « approuve la <b>44</b> » — ou clique 👍 sur une MR. 🌱', intent: 'liv_approve' };
    }

    // ── FERMER : « ferme la 44 », « ferme-la », « abandonne / jette / annule la MR »
    if ((/\bferm(e|er|ee)?\b|\bclot(ure|urer|ee)?\b|\bcloture[rz]?\b|\babandonne[rz]?\b|\bjette\b|\bannule[rz]? (la )?mr\b|\bsupprime[rz]? (la )?mr\b/.test(n))
      && !OTHER.test(n) && hasRef) {
      if (iid) { setLast(iid); return closeAsk(iid); }
      return { html: 'Quelle MR je ferme ? « ferme la <b>44</b> ». 🌱', intent: 'liv_close' };
    }

    // ── TRAIN / statut : « le train », « où en est ? », « ça avance ? », « la pipeline de la 44 »
    var trainWord = /\btrain\b/.test(n) || /\bla pipeline\b.*(mr|livraison|\d)|\bpipeline de (la|ma)\b/.test(n);
    var statusWord = /\bou (en est|ca en est|c en est)\b|\bca avance\b|\bavancement\b|\bstatut\b|\bstatus\b|\bou ca en est\b/.test(n);
    if ((trainWord || (statusWord && (explicitIid || lastMr))) && !OTHER.test(n)) {
      if (iid) { setLast(iid); return await trainForMr(iid); }
      if (trainWord) return { html: 'Le train de quelle livraison ? « le train de la <b>44</b> ». 🚂', intent: 'liv_train' };
    }

    // ── PRÉPARER : « prépare une livraison [patch] [sur feature/x] », « livre feature/x en minor »,
    //    « sors une release » — mais pas « livrer plus souvent » (DORA).
    // Verbe FORT (prépare/bump/release…) : engage même sans branche ni niveau (on demande).
    // Verbe FAIBLE (livre/déploie/envoie…) : seulement si branche ou niveau présent (sinon = merge).
    var strongPrep = /\bprepare[rz]?\b|\bpreparer\b|\bpreparation\b|\bbump\b|\bincremente[rz]?\b|\bnouvelle (version|release)\b|\bsors?( moi)? (une )?(version|release)\b|\bfais( moi)? (une )?(livraison|release|version)\b|\bcree[rz]?( moi)? (une )?(release|version)\b/.test(n);
    var softPrep = /\blivre[rz]?\b|\bdeploie[rz]?\b|\bmets? en prod\b|\benvoie[rz]?\b|\bbalance[rz]?\b|\bmettre en prod\b/.test(n);
    var BUMP_RX = /\b(patch|minor|mineure?|major|majeure?|correctif|moyenne?|intermediaire|grosse version|petite version|breaking)\b/;
    var hasBump = BUMP_RX.test(n);
    if (!explicitIid && !/\bsouvent\b|\bfrequence\b|\bplus vite\b|\bregulier/.test(n)
      && (strongPrep || (softPrep && (branch || hasBump)))) {
      var brc = branch || lastBranch;
      if (!brc) return { html: 'Pour quelle <b>branche</b> je prépare la livraison ? Ex. « prépare une livraison sur <b>feature/xxx</b> » — tu choisiras l\'<b>environnement</b> et le <b>niveau</b> juste après. 🌿', intent: 'liv_prepare' };
      // Niveau ET env sur le texte SANS le nom de branche (évite « fix/x » lu comme patch, « feature/dev » comme dev).
      var nb = n.split(lvNorm(brc)).join(' ');
      var env = parseEnv(n, brc);
      var bump = BUMP_RX.test(nb) ? parseBump(nb) : null;
      if (!env) return askEnv(brc, bump);          // pas d'env → dev / uat / prod en boutons
      if (!bump) return await prepPreview(brc, env); // pas de niveau → majeur / mineur / patch (env reporté)
      var rp = await doPrepare(brc, bump, env); rp.intent = 'liv_prepare'; return rp;
    }

    // ── MERGER / LIVRER une MR : « merge la 44 », « merge-la », « livre la 44 », « envoie-la en prod »
    if ((/\bmerge[rz]?[- ]?(la|le|ca)?\b|\bfusionne[rz]?\b|\blivre[rz]? (la|le|ca|cette mr|ma mr)\b|\bmets? (la|ca)? ?en prod\b|\bdeploie[rz]?[- ]?(la|le|ca)?\b|\benvoie[rz]?[- ]?(la|le|ca)?( en prod)?\b|\bbalance[rz]?[- ]?(la|le|ca)?( en prod)?\b|\bgo pour\b/.test(n))
      && !branch && !OTHER.test(n) && hasRef) {
      if (iid) { setLast(iid); return mergeAsk(iid); }
      return { html: 'Quelle MR je merge ? « merge la <b>44</b> » — ou clique 🚀 sur une MR. 🌱', intent: 'liv_merge' };
    }

    // ── DÉTAIL d'une MR : « la mr 44 », « montre la 44 », « ouvre-la », « détaille la 44 »
    if (explicitIid && /\b(montre|affiche|detail|detaille|ouvre|voir|regarde|c est quoi|dis moi|la mr|mr numero|mr|merge request)\b/.test(n) && !/\bles mr\b|\btoutes\b|\bliste\b/.test(n) && !OTHER.test(n)) {
      setLast(explicitIid); return await mrDetail(explicitIid);
    }
    if (/\b(montre|affiche|ouvre|detaille?|voir|regarde)[- ]?(la|le|moi)\b/.test(n) && lastMr && !/\bles mr\b|\btoutes\b|\bliste\b/.test(n) && !OTHER.test(n)) {
      return await mrDetail(lastMr);
    }

    // ── LISTER : « les MR », « MR à valider », « quoi à merger ? », « mes livraisons en cours »
    var listAsk =
      /\b(les mr|mr ouvertes|mr a valider|mr a relire|mr a merger|mes mr|mr du repo|livraisons?( en cours| a valider| ouvertes?)|quoi a (valider|merger|relire|livrer)|qu y a t il a (valider|merger|livrer)|(a|à) (valider|merger|relire))\b/.test(n)
      || ((/\bmr\b|\bmerge request\b/.test(n)) && /\b(liste|montre|affiche|en attente|en cours|a livrer|a valider)\b/.test(n));
    if (listAsk && !/\bcombien\b|\bnombre\b/.test(n) && !OTHER.test(n)) {
      return await listMRs(n, q);
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════
  //  Boutons du chat → window.salsiLiv(action, arg)
  // ══════════════════════════════════════════════════════════════════
  window.salsiLiv = async function (action, arg, arg2, arg3) {
    var say = window.salsiQaSay || function (h) { console.log('[salsi]', h); return null; };
    // arg = iid d'une MR pour ces actions → devient le contexte courant.
    // (PAS pour trainPipe/joblog/trainSha/prep : l'arg y est un id pipeline/job ou une branche.)
    if (typeof arg === 'number' && /^(detail|approve|mergeAsk|merge|closeAsk|close|train)$/.test(action)) setLast(arg);
    if (action === 'cancel') { say('👍 Ok, on ne touche à rien.'); return; }
    if (action === 'later') { setLast(arg); say('👌 Ok, on garde <b>!' + arg + '</b> sous le coude. Dis « merge la ' + arg + ' » quand tu veux livrer.'); return; }
    // Livraison depuis une notif proactive : la MR peut être sur un autre repo que le courant.
    if (action === 'mergeCtx') {
      var cc = ctx();
      if (cc.err) { say(cc.err); return; }
      if (String(cc.pid) !== String(arg2)) { say('🔀 La MR <b>!' + arg + '</b> est sur un autre repo. Sélectionne-le dans le hub, puis dis « merge la ' + arg + ' ».'); return; }
      setLast(arg); say(mergeAsk(arg).html); return;
    }
    var pend = say('⏳ …');
    function done(r) { if (pend) pend.innerHTML = (r && r.html) || '😅 Rien à afficher.'; else say((r && r.html) || ''); }
    try {
      // Wizard de préparation : env choisi → soit on prépare (niveau connu), soit on demande le niveau.
      if (action === 'prepEnv') { var bmp = arg2 || null; return done(bmp ? await doPrepare(arg, bmp, arg3) : await prepPreview(arg, arg3)); }
      if (action === 'prep') return done(await doPrepare(arg, arg2 || 'patch', arg3 || null));
      if (action === 'detail') return done(await mrDetail(arg));
      if (action === 'approve') return done(await doApprove(arg));
      if (action === 'mergeAsk') return done(mergeAsk(arg));
      if (action === 'merge') return done(await doMerge(arg));
      if (action === 'closeAsk') return done(closeAsk(arg));
      if (action === 'close') return done(await doClose(arg));
      if (action === 'train') return done(await trainForMr(arg));
      if (action === 'trainPipe') return done(await trainSummary(arg));
      if (action === 'trainSha') { var c = ctx(); if (c.err) return done({ html: c.err }); var pl = await findDeliveryPipeline(c, arg); return done(pl ? await trainSummary(pl.id) : { html: '🚂 Pipeline pas encore visible — réessaie dans un instant.' }); }
      if (action === 'joblog') {
        var cj = ctx(); if (cj.err) return done({ html: cj.err });
        var t = await jobTail(cj, arg, 25);
        return done({ html: t.length ? '<b>📄 Fin du log</b><div style="font-family:ui-monospace,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.35);border-radius:8px;padding:8px 10px;margin-top:5px;max-height:230px;overflow:auto">' + lvEsc(t.join('\n')) + '</div>' : 'Logs indisponibles pour ce job (pas encore démarré ?).' });
      }
      done({ html: 'Action inconnue.' });
    } catch (e) { done({ html: '😅 Échec de l\'action — réessaie.' }); }
  };

  // Au chargement du hub : ré-arme la surveillance des MR laissées en attente.
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      try { if (S.loadAuth && S.loadAuth({ redirect: false }) && loadWatch().length) ensurePoller(); } catch (e) { }
    }, 2500);
  });
