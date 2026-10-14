import {useEffect,useRef,useState,type ReactNode} from 'react';

export function CopyButton({text,label}:{text:string;label:string}) {
  const [status,setStatus]=useState('');
  useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),2000);return()=>clearTimeout(timer);},[status]);
  return <button type="button" className="copy-button" aria-label={label} title={label} onClick={async()=>{try{await navigator.clipboard.writeText(text);setStatus('Copied');}catch{setStatus('Select to copy');}}}>{status||'Copy'}</button>;
}

export function Dialog({children,onClose,busy,titleId}:{children:ReactNode;onClose:()=>void;busy:boolean;titleId:string}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;const previous=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} onClick={event=>{if(event.target!==event.currentTarget||busy)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}>{children}</dialog>;
}

export function PolicyEditor({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const [advanced,setAdvanced]=useState(false);
  let policy:Record<string,unknown>={};let valid=true;
  try{policy=JSON.parse(value);if(!policy||Array.isArray(policy)||typeof policy!=='object')valid=false;}catch{valid=false;}
  const update=(key:string,next:unknown)=>onChange(JSON.stringify({...policy,[key]:next},null,2));
  const defaults:Record<string,number>={rateLimit:120,windowSeconds:60,bodyLimit:1048576,responseLimit:2097152,timeoutMs:5000};
  return <><div className="editor-switch"><span>Limits & authentication</span><button type="button" aria-pressed={advanced} onClick={()=>setAdvanced(!advanced)}>{advanced?'Simple controls':'Advanced JSON'}</button></div>{advanced?<label>Security policy<textarea className="code-editor" aria-label="Security policy" rows={16} value={value} onChange={e=>onChange(e.target.value)} spellCheck={false}/></label>:!valid?<p role="alert" className="error">Fix the JSON in Advanced JSON to use simple controls.</p>:<><div className="form-grid policy-fields">{[['rateLimit','Requests per window',1,100000],['windowSeconds','Window (seconds)',1,3600],['bodyLimit','Request limit (bytes)',1,10485760],['responseLimit','Response limit (bytes)',1,10485760],['timeoutMs','Timeout (ms)',100,30000]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} step={1} value={Number(policy[key]??defaults[key])} onChange={e=>update(String(key),Number(e.target.value))}/></label>)}<label>Authentication<select value={String(policy.authMode||'none')} onChange={e=>update('authMode',e.target.value)}><option value="none">None</option><option value="apiKey">API key</option><option value="jwt">JWT · RS256</option></select></label></div>{policy.authMode==='apiKey'&&<p className="field-hint">Create a key in API credentials. Clients send it as <code>x-api-key</code>.</p>}{policy.authMode==='jwt'&&<><div className="form-grid"><label>Issuer<input value={String(policy.issuer||'')} onChange={e=>update('issuer',e.target.value)}/></label><label>Audience<input value={String(policy.audience||'')} onChange={e=>update('audience',e.target.value)}/></label></div><label>Public signing key<textarea rows={5} value={String(policy.publicKey||'')} onChange={e=>update('publicKey',e.target.value)} placeholder="-----BEGIN PUBLIC KEY-----"/></label></>}<p className="field-hint">IP rules and per-route authentication are available in Advanced JSON.</p></>}</>;
}
