/* daily-report · compute.js — logique pure : dates, stats, helpers d'affichage. */

        function escapeHtml(v) { return window.Salsifi.escapeHtml(v); }

        // Échappement strict pour attributs HTML (href, data-*, etc.).
        // Plus restrictif qu'escapeHtml — neutralise aussi ' et ".

        function escapeAttr(v) { return window.Salsifi.escapeAttr(v); }

        // ══════════════════════════════════════════════════════════════════
        //  INITIALISATION
        // ══════════════════════════════════════════════════════════════════


        function formatDateDisplay(date) {
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            const formatted = date.toLocaleDateString('fr-FR', options);
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
        

        function formatDateISO(date) {
            return date.toISOString().split('T')[0];
        }
        

        function formatDuration(seconds) {
            if (!seconds) return '-';
            if (seconds < 60) return `${seconds}s`;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}m ${secs}s`;
        }


        function getScoreClass(score) {
            if (score >= 80) return 'good';
            if (score >= 50) return 'warning';
            return 'bad';
        }


        function formatTime(dateStr) {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
        

        function truncate(str, max) {
            if (!str) return '';
            return str.length > max ? str.substring(0, max) + '...' : str;
        }
        

        function daysSince(dateStr) {
            const date = new Date(dateStr);
            const now = new Date();
            return Math.floor((now - date) / (1000 * 60 * 60 * 24));
        }

        // ══════════════════════════════════════════════════════════════════
        //  RAPPORT SEMAINE / MOIS
        // ══════════════════════════════════════════════════════════════════

