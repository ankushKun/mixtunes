/* PostHog for the yTunes marketing site only (not the browser extension).
   Uses the managed reverse proxy + EU UI host from project settings.
   Docs: https://posthog.com/docs/libraries/js
         https://posthog.com/docs/advanced/proxy */
(function () {
  "use strict";

  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    document.addEventListener("DOMContentLoaded", function () {
      var status = document.querySelector("[data-analytics-status]");
      if (status) status.textContent = "Analytics are disabled on local previews.";
      var outBtn = document.querySelector("[data-analytics-opt-out]");
      var inBtn = document.querySelector("[data-analytics-opt-in]");
      if (outBtn) outBtn.hidden = true;
      if (inBtn) inBtn.hidden = true;
    });
    return;
  }

  var TOKEN = "phc_nBvIMuMmaqQkAXL36Bi6eyTRga0A04klevYFyZf4cfc";
  var API_HOST = "https://p1.ankush.one";
  var UI_HOST = "https://eu.posthog.com";

  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="fo po init Fo Oo qo Zs Lo Bo Ro capture Do vo Go calculateEventProperties Vo register register_once register_for_session unregister unregister_for_session Ko Ao Zo getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync Yo identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset Xo shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty Qo Uo createPersonProfile setInternalOrTestUser Jo Eo il opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Ho debug Js mn getPageViewId captureTraceFeedback captureTraceMetric Co".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  posthog.init(TOKEN, {
    api_host: API_HOST,
    ui_host: UI_HOST,
    defaults: "2026-05-30",
    person_profiles: "identified_only",
    respect_dnt: true,
    // Marketing pages only — keep recordings off unless enabled in PostHog.
    disable_session_recording: true,
    loaded: function (ph) {
      syncOptOutUi(ph);
    }
  });

  function ready(ph) {
    return ph && typeof ph.capture === "function";
  }

  function capture(event, props) {
    if (!ready(window.posthog)) return;
    window.posthog.capture(event, props || {});
  }

  function syncOptOutUi(ph) {
    var status = document.querySelector("[data-analytics-status]");
    var outBtn = document.querySelector("[data-analytics-opt-out]");
    var inBtn = document.querySelector("[data-analytics-opt-in]");
    if (!status && !outBtn && !inBtn) return;

    var optedOut =
      ph && typeof ph.has_opted_out_capturing === "function"
        ? ph.has_opted_out_capturing()
        : false;

    if (status) {
      status.textContent = optedOut
        ? "Website analytics are off in this browser."
        : "Website analytics are on in this browser.";
    }
    if (outBtn) outBtn.hidden = optedOut;
    if (inBtn) inBtn.hidden = !optedOut;
  }

  document.addEventListener("click", function (event) {
    var out = event.target.closest("[data-analytics-opt-out]");
    var inn = event.target.closest("[data-analytics-opt-in]");
    if (!out && !inn) return;
    event.preventDefault();
    if (!ready(window.posthog)) return;
    if (out) window.posthog.opt_out_capturing();
    if (inn) window.posthog.opt_in_capturing();
    syncOptOutUi(window.posthog);
  });

  window.yTunesAnalytics = {
    capture: capture,
    syncOptOutUi: function () {
      syncOptOutUi(window.posthog);
    }
  };
})();
