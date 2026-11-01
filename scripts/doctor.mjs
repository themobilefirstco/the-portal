import {localControl} from './local-control.mjs';
import {doctorReport} from '../src/doctor-report.mjs';
let report;
try {
  if (process.platform !== 'darwin') report={schemaVersion:1,healthy:false,exitCode:2,checks:[{code:'macos_required',status:'error'}]};
  else report=doctorReport(await localControl()('status'));
} catch (error) {
  const human = /Keychain|handoff/.test(error.message);
  report={schemaVersion:1,healthy:false,exitCode:human?1:2,checks:[{code:human?'keychain_handoff_needed':'controller_unreachable',status:human?'needs_human':'error'}],humanChecklist:'docs/human-only-checklist.md'};
}
console.log(JSON.stringify(report,null,2)); process.exitCode=report.exitCode;
