import { useEffect } from "react";
import {
  pluginLoadReportSink,
  type PluginLoadReport,
} from "@plugins/framework/plugins/web-sdk/core";
import { report } from "@plugins/reports/web";

function buildReport(info: PluginLoadReport) {
  const { pluginPath, message } = info;
  return {
    kind: "crash" as const,
    source: "plugin-load" as const,
    message,
    url: window.location.href,
    userAgent: navigator.userAgent,
    // No throw-site stack for a chunk-load failure; the plugin path is the
    // distinguishing info, so encode it into errorType — one crash task per
    // failing plugin (the server fingerprints by errorType + stack).
    data: { errorType: `PluginLoadError ${pluginPath}`, stack: null },
  };
}

export function PluginLoadErrorReporter() {
  useEffect(() => {
    pluginLoadReportSink.register((info) => {
      void report(buildReport(info));
    });
    return () => pluginLoadReportSink.register(null);
  }, []);

  return null;
}
