/* smart-estimate · data.js — I/O (auth, fetch). */

        function loadAuth() {
            return window.Salsifi.loadAuth({ redirect: false });
        }


        async function fetchAllMergedMRs(since) {
            return window.Salsifi.gitlabPaginate(GITLAB_URL, GITLAB_TOKEN,
                `/projects/${projectId}/merge_requests?state=merged&updated_after=${since}`,
                { maxPages: 10, throwOnError: true });
        }

