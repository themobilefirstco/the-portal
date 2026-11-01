import AppKit
import WebKit
import ServiceManagement
import CryptoKit

// No remote page is allowed to share the authenticated room-control web view.
func localURL(_ url: URL, port: Int) -> Bool {
    url.scheme == "http" && url.host == "127.0.0.1" && url.port == port && url.user == nil && url.password == nil
}
func externalURL(_ url: URL) -> Bool {
    url.scheme == "https" && url.host != nil && url.user == nil && url.password == nil
}

final class PortalApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var child: Process?
    var statusItem: NSStatusItem!
    var loginItem: NSMenuItem!
    var ready = false, quitting = false
    var instance = UUID().uuidString
    var port = 4280
    var state = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/The Portal/state")
    var controller: URL { Bundle.main.resourceURL!.appendingPathComponent("controller") }
    var origin: URL { URL(string: "http://127.0.0.1:\(port)")! }
    var testMode = false
    var statusLabel: NSTextField!
    var environment: [String:String] {
        var env = [String:String]()
        for key in ["HOME", "USER", "LOGNAME", "TMPDIR", "PATH", "LANG"] { env[key] = ProcessInfo.processInfo.environment[key] }
        env["PORTAL_DATA_DIR"] = state.path
        env["PORTAL_PORT"] = String(port)
        env["PORTAL_AGENT_PORT"] = String(port + 1)
        env["PORTAL_DESKTOP_INSTANCE"] = instance
        env["PORTAL_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        if testMode { env["PORTAL_TEST_MODE"] = "1"; env["PORTAL_NO_BROWSER"] = "1" }
        return env
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        #if PORTAL_TESTING
        do {
            testMode = true; port = 43880
            state = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("portal-app-smoke-\(UUID().uuidString)")
        }
        #endif
        buildMenus()
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:1120,height:860), styleMask:[.titled,.closable,.miniaturizable,.resizable], backing:.buffered, defer:false)
        window.title = testMode ? "The Portal — isolated test" : "The Portal"
        window.minSize = NSSize(width:720,height:650)
        window.isReleasedWhenClosed = false
        window.center()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame:window.contentView!.bounds,configuration:configuration)
        web.autoresizingMask = [.width,.height]
        web.navigationDelegate = self; web.uiDelegate = self
        window.contentView!.addSubview(web)
        statusLabel = NSTextField(wrappingLabelWithString:"Starting your room…")
        statusLabel.alignment = .center; statusLabel.font = .systemFont(ofSize:17)
        statusLabel.frame = NSRect(x:80,y:350,width:960,height:120)
        statusLabel.autoresizingMask = [.width,.minYMargin,.maxYMargin]
        window.contentView!.addSubview(statusLabel)
        showWindow()
        Task { await startController() }
    }
    func buildMenus() {
        let main = NSMenu(); let appRoot = NSMenuItem(); main.addItem(appRoot)
        let appMenu = NSMenu(); appRoot.submenu = appMenu
        appMenu.addItem(withTitle:"About The Portal",action:#selector(about),keyEquivalent:"")
        appMenu.addItem(withTitle:"Show Room Controls",action:#selector(showWindow),keyEquivalent:"0")
        loginItem = appMenu.addItem(withTitle:"Open at Login",action:#selector(toggleLogin),keyEquivalent:"")
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
        appMenu.addItem(withTitle:"Get Google Chrome…",action:#selector(getChrome),keyEquivalent:"")
        appMenu.addItem(withTitle:"Setup Guide…",action:#selector(guide),keyEquivalent:"")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle:"Hide The Portal",action:#selector(NSApplication.hide(_:)),keyEquivalent:"h")
        appMenu.addItem(withTitle:"Quit The Portal…",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        for item in appMenu.items where item.action != #selector(NSApplication.terminate(_:)) && item.action != #selector(NSApplication.hide(_:)) { item.target = self }
        let editRoot = NSMenuItem(title:"Edit",action:nil,keyEquivalent:""); main.addItem(editRoot)
        let edit = NSMenu(title:"Edit"); editRoot.submenu = edit
        for (title,action,key) in [("Undo","undo:","z"),("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a")] { edit.addItem(withTitle:title,action:Selector(action),keyEquivalent:key) }
        NSApp.mainMenu = main
        statusItem = NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName:"rectangle.inset.filled",accessibilityDescription:"The Portal room controls")
        let menu = NSMenu(); let show = menu.addItem(withTitle:"Open The Portal",action:#selector(showWindow),keyEquivalent:""); show.target = self
        menu.addItem(withTitle:"Quit The Portal…",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"")
        statusItem.menu = menu
    }
    @objc func showWindow() { window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true) }
    @objc func getChrome() { NSWorkspace.shared.open(URL(string:"https://www.google.com/chrome/")!) }
    @objc func guide() { NSWorkspace.shared.open(URL(string:"https://github.com/themobilefirstco/the-portal/blob/main/docs/mac-app.md")!) }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options:[.applicationName:"The Portal",.credits:NSAttributedString(string:"A Google Meet room for your team.\nClosing this window keeps the room running. Quit stops automatic joining.")]) }
    @objc func toggleLogin() {
        guard !testMode else { return }
        guard Bundle.main.bundleURL.path.hasPrefix("/Applications/") || Bundle.main.bundleURL.path.hasPrefix(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications").path + "/") else { alert("Move The Portal into Applications before enabling Open at Login."); return }
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
            if SMAppService.mainApp.status == .requiresApproval { alert("Allow The Portal in System Settings → General → Login Items.") }
        } catch { alert("macOS could not update Open at Login. Check System Settings → General → Login Items.") }
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }
    func alert(_ message: String) { let a=NSAlert(); a.messageText="The Portal"; a.informativeText=message; a.runModal() }
    func fail(_ message: String) { statusLabel.stringValue=message; statusLabel.isHidden=false; web.isHidden=true }
    func probe() async -> [String:Any]? {
        var request=URLRequest(url:origin.appendingPathComponent("health")); request.timeoutInterval=1
        guard let (data,response)=try? await URLSession.shared.data(for:request) else { return nil }
        guard (response as? HTTPURLResponse)?.statusCode == 200, let value = try? JSONSerialization.jsonObject(with:data) as? [String:Any] else { return ["occupied":true] }
        return value
    }
    @MainActor func startController() async {
        if await probe() != nil { fail("Another service is already using the room port (4280). Quit the other Portal app, or stop the source installation with Stop Portal.command, then reopen this app. Your room settings are preserved."); return }
        do {
            try FileManager.default.createDirectory(at:state,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            let p=Process(); p.executableURL=controller.appendingPathComponent("runtime/node")
            p.arguments=[controller.appendingPathComponent("src/server.mjs").path]
            p.currentDirectoryURL=controller; p.environment=environment
            let log=state.deletingLastPathComponent().appendingPathComponent(testMode ? "smoke-\(instance).log" : "desktop.log")
            if !FileManager.default.fileExists(atPath:log.path) { FileManager.default.createFile(atPath:log.path,contents:nil,attributes:[.posixPermissions:0o600]) }
            let output=try FileHandle(forWritingTo:log); try output.seekToEnd()
            p.standardOutput=output; p.standardError=output
            p.terminationHandler={ [weak self] _ in DispatchQueue.main.async { guard let self, !self.quitting else { return }; self.ready=false; self.fail("The room controller stopped. Quit and reopen The Portal. If it happens again, review desktop.log in Library/Application Support/The Portal. Your saved setup is preserved.") } }
            child=p; try p.run(); try output.close()
            for _ in 0..<90 {
                guard p.isRunning else { return }
                if let health=await probe(), health["desktopInstance"] as? String == instance, health["controllerLastTick"] is NSNumber {
                    let keyState=state, keyController=controller, keyTestMode=testMode
                    let token = try await Task.detached { try PortalApp.readControlKey(state:keyState,controller:keyController,testMode:keyTestMode) }.value
                    guard p.isRunning else { return }
                    var components=URLComponents(url:origin,resolvingAgainstBaseURL:false)!
                    components.fragment="key=\(token)"
                    statusLabel.isHidden=true; web.isHidden=false; ready=true
                    web.load(URLRequest(url:components.url!))
                    return
                }
                try await Task.sleep(nanoseconds:500_000_000)
            }
            fail("The room did not finish starting. Check for a Keychain prompt, then quit and reopen The Portal. See the setup guide for recovery.")
        } catch { fail("The Portal could not start or unlock its room controls. Unlock your login Keychain and allow the Portal helper when macOS asks, then quit and reopen the app.") }
    }
    nonisolated static func readControlKey(state:URL,controller:URL,testMode:Bool) throws -> String {
        var data: Data
        if testMode { data=try Data(contentsOf:state.appendingPathComponent("control-key.json")) }
        else {
            let digest=SHA256.hash(data:Data(state.standardizedFileURL.path.utf8)).map{String(format:"%02x",$0)}.joined().prefix(24)
            let p=Process(); p.executableURL=controller.appendingPathComponent("runtime/portal-keychain")
            let input=Pipe(),output=Pipe(); p.standardInput=input; p.standardOutput=output; p.standardError=FileHandle.nullDevice
            try p.run()
            DispatchQueue.global().asyncAfter(deadline:.now()+35) { if p.isRunning { p.terminate() } }
            try input.fileHandleForWriting.write(contentsOf:JSONSerialization.data(withJSONObject:["operation":"read","service":"org.theportal.room.\(digest)","account":"control-key"]))
            try input.fileHandleForWriting.close()
            data=output.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
            guard p.terminationStatus == 0 else { throw NSError(domain:"Keychain",code:1) }
        }
        guard let key=try JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed) as? String, key.range(of:"^[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil else { throw NSError(domain:"Keychain",code:2) }
        return key
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows:Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminate(_ sender:NSApplication) -> NSApplication.TerminateReply {
        if quitting { return .terminateNow }
        if child?.isRunning == true && !testMode {
            let a=NSAlert(); a.messageText="Quit The Portal?"; a.informativeText="This stops automatic joining and closes the room’s Chrome session, including any active call. Close the window instead to keep the room running."
            a.addButton(withTitle:"Keep Running"); a.addButton(withTitle:"Quit and Stop Room")
            if a.runModal() != .alertSecondButtonReturn { return .terminateCancel }
        }
        quitting=true
        guard let p=child, p.isRunning else { return .terminateNow }
        p.terminationHandler={ _ in DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate:true) } }
        p.terminate()
        return .terminateLater
    }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        guard let url=action.request.url else { decisionHandler(.cancel); return }
        if localURL(url,port:port) {
            decisionHandler(action.shouldPerformDownload ? .download : .allow); return
        }
        if url.scheme == "blob", let current=webView.url, localURL(current,port:port), action.shouldPerformDownload { decisionHandler(.download); return }
        if externalURL(url), action.targetFrame?.isMainFrame != false { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView:WKWebView,createWebViewWith configuration:WKWebViewConfiguration,for action:WKNavigationAction,windowFeatures:WKWindowFeatures) -> WKWebView? {
        if let url=action.request.url, externalURL(url) { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void) {
        guard frame.isMainFrame, let url=frame.request.url, localURL(url,port:port) else { completionHandler(nil); return }
        let panel=NSOpenPanel(); panel.allowsMultipleSelection=false; panel.canChooseDirectories=false
        panel.beginSheetModal(for:window){ response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload) { download.delegate=self }
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void) {
        let panel=NSSavePanel(); panel.nameFieldStringValue="vercel.json"
        panel.beginSheetModal(for:window){ result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!) {
        #if PORTAL_TESTING
        if testMode && ProcessInfo.processInfo.environment["PORTAL_APP_SMOKE_TEST"] == "1" { smokeCheck(remaining:30) }
        #endif
    }
    #if PORTAL_TESTING
    func smokeCheck(remaining:Int) {
        web.evaluateJavaScript("typeof state !== 'undefined' && Boolean(state?.health) && document.querySelector('#roomName') !== null && document.querySelector('#googleNext').disabled") { result,error in
            if result as? Bool == true && error == nil { print("PORTAL_NATIVE_SMOKE_OK"); NSApp.terminate(nil) }
            else if remaining > 0 { DispatchQueue.main.asyncAfter(deadline:.now()+0.2) { self.smokeCheck(remaining:remaining-1) } }
            else { print("PORTAL_NATIVE_SMOKE_FAILED"); NSApp.terminate(nil) }
        }
    }
    #endif

}

if CommandLine.arguments.contains("--self-test") {
    precondition(localURL(URL(string:"http://127.0.0.1:4280/")!,port:4280))
    for value in ["http://localhost:4280/","https://127.0.0.1:4280/","http://127.0.0.1:4281/","http://127.0.0.1.example.com:4280/","file:///etc/passwd","http://user@127.0.0.1:4280/"] { precondition(!localURL(URL(string:value)!,port:4280)) }
    precondition(externalURL(URL(string:"https://accounts.google.com/")!))
    precondition(!externalURL(URL(string:"javascript:alert(1)")!))
    print("Native navigation policy checks passed")
} else {
    let app=NSApplication.shared
    let delegate=PortalApp(); app.delegate=delegate
    app.setActivationPolicy(.regular); app.run()
}
