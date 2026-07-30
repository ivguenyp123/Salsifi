/* branch-cleaner · compute.js — logique pure (calculs, helpers). */

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Échappe les caractères dangereux pour un usage dans un attribut HTML.
        // (escapeHtml suffit pour le contenu textuel mais pour data-attributes
        // on veut aussi neutraliser " et ').

        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  INIT
        // ══════════════════════════════════════════════════════════════════

        // ── AUTH + REPO — modèle plateforme (aligné DevOps Hub) ──
