import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {VERSION} from '../src/config.mjs';

if(process.platform !== 'darwin') throw new Error('Build on macOS.');
const flags=new Set(process.argv.slice(2));
if([...flags].some(x=>!['--unsigned','--testing','--dmg'].includes(x))) throw new Error('Use --unsigned, --testing, --dmg.');
const identity=flags.has('--unsigned') ? '-' : process.env.PORTAL_SIGNING_IDENTITY;
if(!identity || (identity !== '-' && !identity.startsWith('Developer ID Application:'))) throw new Error('Set PORTAL_SIGNING_IDENTITY to a Developer ID Application identity, or explicitly use --unsigned for a preview.');
if(flags.has('--testing') && flags.has('--dmg')) throw new Error('Test fixtures cannot be packaged for distribution.');
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)throw new Error(`${cmd} failed`);};
const appName=flags.has('--testing') ? 'The Portal Test' : 'The Portal';
const app=path.resolve('dist',`${appName}.app`), contents=path.join(app,'Contents');
fs.mkdirSync('dist',{recursive:true}); fs.rmSync(app,{recursive:true,force:true});
const resources=path.join(contents,'Resources'), macos=path.join(contents,'MacOS'), controller=path.join(resources,'controller');
for(const dir of [resources,macos,controller])fs.mkdirSync(dir,{recursive:true});
for(const entry of ['src','web','package.json','config.schema.json','LICENSE','THIRD_PARTY_NOTICES.md','runtime/node','runtime/portal-keychain','runtime/NODE-LICENSE']){
  fs.mkdirSync(path.dirname(path.join(controller,entry)),{recursive:true});
  fs.cpSync(entry,path.join(controller,entry),{recursive:true});
}
const identifier='co.themobilefirst.portal'+(flags.has('--testing')?'.testing':'');
const xml=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleName</key><string>The Portal</string><key>CFBundleDisplayName</key><string>The Portal</string>
<key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleExecutable</key><string>Portal</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${VERSION}</string><key>CFBundleVersion</key><string>2</string>
<key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/>
<key>CFBundleIconFile</key><string>Portal</string><key>NSHumanReadableCopyright</key><string>MIT License · The Portal contributors</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>`;
fs.writeFileSync(path.join(contents,'Info.plist'),xml);
const arch=os.arch()==='arm64'?'arm64':'x86_64';
run('xcrun',['swiftc','-O','-target',`${arch}-apple-macos14.0`,'-module-cache-path','runtime/module-cache',...(flags.has('--testing')?['-D','PORTAL_TESTING']:[]),'native/PortalApp.swift','-o',path.join(macos,'Portal'),'-framework','AppKit','-framework','WebKit','-framework','ServiceManagement','-framework','CryptoKit']);
const iconset=path.resolve('dist/Portal.iconset');fs.mkdirSync(iconset,{recursive:true});
run('xcrun',['swiftc','-module-cache-path','runtime/module-cache','native/Icon.swift','-o','dist/make-icon','-framework','AppKit']);
run(path.resolve('dist/make-icon'),[iconset]);
// Modern ICNS stores PNG representations in length-prefixed chunks.
const iconChunks = [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]].map(([type,size])=>{
  const source=size===64?'icon_32x32@2x.png':size===1024?'icon_512x512@2x.png':`icon_${size}x${size}.png`;
  const png=fs.readFileSync(path.join(iconset,source)),header=Buffer.alloc(8);
  header.write(type);header.writeUInt32BE(png.length+8,4);return Buffer.concat([header,png]);
});
const iconHeader=Buffer.alloc(8);iconHeader.write('icns');iconHeader.writeUInt32BE(8+iconChunks.reduce((n,b)=>n+b.length,0),4);
fs.writeFileSync(path.join(resources,'Portal.icns'),Buffer.concat([iconHeader,...iconChunks]));
const signing=['--force','--sign',identity,'--options','runtime',...(identity==='-'?[]:['--timestamp'])];
run('codesign',[...signing,'--entitlements','native/node-entitlements.plist',path.join(controller,'runtime/node')]);
run('codesign',[...signing,'--identifier','org.theportal.keychain',path.join(controller,'runtime/portal-keychain')]);
run('codesign',[...signing,app]);
run('codesign',['--verify','--deep','--strict',app]);
run(path.join(macos,'Portal'),['--self-test']);
run(path.join(controller,'runtime/node'),['--version']);
if(flags.has('--dmg')){
 const stage=path.resolve('dist/dmg-stage'); fs.rmSync(stage,{recursive:true,force:true}); fs.mkdirSync(stage);
 fs.cpSync(app,path.join(stage,'The Portal.app'),{recursive:true}); fs.symlinkSync('/Applications',path.join(stage,'Applications'));
 fs.writeFileSync(path.join(stage,'READ ME.txt'),`The Portal ${VERSION}\n\nDrag The Portal into Applications, then open it. macOS 14 or later. Install Google Chrome when prompted. No Terminal, Node installation or developer tools required.\n\n${identity==='-'?'UNSIGNED PREVIEW: this build is ad-hoc signed, not Developer ID signed or notarized. macOS will warn or block it. Only use this preview if you trust its source. Never disable Gatekeeper.':''}\n\nClosing the window keeps the room running. Quit stops the room and its Chrome session. Open at Login is optional in the app menu. Google setup and real device tests still require the owner.\n\nhttps://github.com/themobilefirstco/the-portal/blob/main/docs/mac-app.md\n`);
 const dmg=path.resolve('dist',`The-Portal-${VERSION}-${os.arch()}${identity==='-'?'-unsigned':''}.dmg`);
 fs.rmSync(dmg,{force:true});run('hdiutil',['create','-volname','The Portal','-srcfolder',stage,'-ov','-format','UDZO',dmg]);
 console.log(dmg);
}
console.log(`Built ${app}. ${identity==='-'?'Unsigned preview: not notarized.':'Developer ID signed; notarization is still required.'}`);
