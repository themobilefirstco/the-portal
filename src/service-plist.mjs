const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Long-lived login service. Installer-only PORTAL_NON_INTERACTIVE is intentionally absent.
export function servicePlist({label, nodePath, serverPath, workingDirectory, stateDir, stdoutPath, stderrPath}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>${xml(serverPath)}</string></array>
<key>WorkingDirectory</key><string>${xml(workingDirectory)}</string>
<key>EnvironmentVariables</key><dict><key>PORTAL_DATA_DIR</key><string>${xml(stateDir)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>LimitLoadToSessionType</key><string>Aqua</string><key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(stdoutPath)}</string>
<key>StandardErrorPath</key><string>${xml(stderrPath)}</string>
</dict></plist>`;
}
