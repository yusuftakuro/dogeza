(() => {
'use strict';
const $=s=>document.querySelector(s);
const app=$('#app'), titleScreen=$('#titleScreen'), gameScreen=$('#gameScreen'), resultScreen=$('#resultScreen');
const figureSvg=$('#figureSvg'), nearBody=$('#nearBody'), farBody=$('#farBody'), analysisLayer=$('#analysisLayer');
const telemetry=$('#telemetry'), telemetryPanel=$('#telemetryPanel'), cue=$('#cue');
const m1Label=$('#m1Label'),m1Value=$('#m1Value'),m2Label=$('#m2Label'),m2Value=$('#m2Value');
const eyesLayer=$('#eyesLayer'), eyeField=$('#eyeField'), eyeReadout=$('#eyeReadout');
const titleFigureWrap=$('#titleFigureWrap'), titleFigure=$('#titleFigure');
const phaseSummary=$('#phaseSummary'), details=$('#details'), detailContent=$('#detailContent');
const resultHint=$('#resultHint'), perfectWord=$('#perfectWord');
const statusCode=$('#statusCode'), runCode=$('#runCode');
const firstPlayKey='dogeza_tutorial_seen_v2',bestKey='dogeza_best_v2';
let best=Number(localStorage.getItem(bestKey)||0), tutorial=!localStorage.getItem(firstPlayKey);
let state='title', sub='idle', raf=0, holdStart=0, pauseStart=0, eyesStart=0, ignoreUp=false, runNo=0;
let kneeRelease=0, headRelease=0, pauseDuration=0, eyesStop=0;
let scores={knees:{},head:{},eyes:{}}, phaseScores={knees:0,head:0,eyes:0}, total=0;
let scanTimer=0;

const P={
 stand:{head:[199,102],neck:[191,137],shoulder:[180,156],elbow:[193,226],wrist:[197,292],hip:[178,284],knee:[188,386],ankle:[184,472],toe:[216,486],farHip:[161,286],farKnee:[154,386],farAnkle:[158,470],farToe:[128,484]},
 kneel:{head:[200,175],neck:[191,211],shoulder:[178,230],elbow:[191,292],wrist:[205,354],hip:[172,349],knee:[214,431],ankle:[151,458],toe:[126,465],farHip:[158,350],farKnee:[181,435],farAnkle:[139,460],farToe:[112,465]},
 bow:{head:[286,423],neck:[252,394],shoulder:[207,360],elbow:[241,407],wrist:[286,449],hip:[171,349],knee:[214,431],ankle:[151,458],toe:[126,465],farHip:[157,350],farKnee:[181,435],farAnkle:[139,460],farToe:[112,465]}
};
const lerp=(a,b,t)=>a+(b-a)*t, mixPt=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t)];
const mixPose=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,mixPt(a[k],b[k],t)]));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const gaussian=(err,tol)=>100*Math.exp(-Math.pow(err/tol,2));
const fmt=v=>Number(v).toFixed(2);
function show(el){[titleScreen,gameScreen,resultScreen].forEach(x=>x.classList.remove('active'));el.classList.add('active')}
function pathLine(a,b,w,cls='suitLine'){return `<path class="${cls}" d="M${a[0]},${a[1]} L${b[0]},${b[1]}" stroke-width="${w}"/>`}
function circle(p,r,cls){return `<circle class="${cls}" cx="${p[0]}" cy="${p[1]}" r="${r}"/>`}
function normal(v){const d=Math.hypot(v[0],v[1])||1;return[-v[1]/d,v[0]/d]}
function torsoPoly(p,ws=23,wh=18){const s=p.shoulder,h=p.hip,n=normal([h[0]-s[0],h[1]-s[1]]);return `${s[0]+n[0]*ws},${s[1]+n[1]*ws} ${s[0]-n[0]*ws},${s[1]-n[1]*ws} ${h[0]-n[0]*wh},${h[1]-n[1]*wh} ${h[0]+n[0]*wh},${h[1]+n[1]*wh}`}
function angleABC(a,b,c){const u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]];const d=(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v));return Math.acos(clamp(d,-1,1))*180/Math.PI}
function renderPose(p,{analysis=false,headMode=false,wobble=0}={}){
  const q=JSON.parse(JSON.stringify(p));
  if(wobble){q.head[0]+=wobble*1.9;q.neck[0]+=wobble*1.3;q.shoulder[1]+=Math.abs(wobble)*.35;q.wrist[0]-=wobble*.7}
  figureSvg.classList.toggle('analyzing',analysis); figureSvg.classList.toggle('headMode',headMode);
  farBody.innerHTML=pathLine(q.farHip,q.farKnee,18)+pathLine(q.farKnee,q.farAnkle,14)+pathLine(q.farAnkle,q.farToe,9,'suitLine shoe');
  nearBody.innerHTML=`<polygon class="suitTorso" points="${torsoPoly(q)}"/>`+
    pathLine(q.shoulder,q.elbow,17)+pathLine(q.elbow,q.wrist,13)+
    pathLine(q.hip,q.knee,22)+pathLine(q.knee,q.ankle,16)+pathLine(q.ankle,q.toe,10,'suitLine shoe')+
    pathLine(q.neck,q.head,10)+circle(q.head,24,'skin');
  const joints=['head','neck','shoulder','elbow','wrist','hip','knee','ankle'];
  const bone=[['head','neck'],['neck','shoulder'],['shoulder','elbow'],['elbow','wrist'],['shoulder','hip'],['hip','knee'],['knee','ankle'],['farHip','farKnee'],['farKnee','farAnkle']];
  const kneeAng=Math.round(angleABC(q.hip,q.knee,q.ankle));
  analysisLayer.innerHTML=bone.map(([a,b])=>pathLine(q[a],q[b],1.35,'analysisBone')).join('')+
    joints.map(k=>circle(q[k],4,'analysisJoint')).join('')+
    `<path class="analysisMeasure" d="M42 486 H318 M${q.head[0]} ${q.head[1]+24} V486"/>`+
    `<text class="analysisText" x="46" y="474">KNEE ${kneeAng}°</text><text class="analysisText" x="250" y="474">FORM VECTOR</text>`;
  return q;
}
function renderTitle(){
  const p=P.bow; const yOff=-268; const scale=.53; const tr=([x,y])=>[(x-18)*scale,(y+yOff)*scale+24];
  const q=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,tr(v)]));
  titleFigure.innerHTML=`<line x1="22" y1="153" x2="330" y2="153" stroke="#111214" stroke-width="1" opacity=".34"/>`+
    `<g opacity=".18">${pathLine(q.farHip,q.farKnee,11)+pathLine(q.farKnee,q.farAnkle,8)+pathLine(q.farAnkle,q.farToe,5)}</g>`+
    `<polygon fill="#111214" points="${torsoPoly(q,12,9)}"/>`+pathLine(q.shoulder,q.elbow,10)+pathLine(q.elbow,q.wrist,7)+pathLine(q.hip,q.knee,13)+pathLine(q.knee,q.ankle,9)+pathLine(q.ankle,q.toe,6)+pathLine(q.neck,q.head,6)+circle(q.head,13,'skin');
}
function scheduleTitleScan(){clearInterval(scanTimer);scanTimer=setInterval(()=>{if(state==='title'){titleFigureWrap.classList.remove('scan');void titleFigureWrap.offsetWidth;titleFigureWrap.classList.add('scan')}},4200)}
function updateBest(){ $('#bestLabel').textContent=best?`BEST ${best.toFixed(2)}`:'BEST —' }
function setCue(txt,on=true){cue.textContent=txt;cue.classList.toggle('show',!!on)}
function startRun(){
  state='game';sub='kneesReady';runNo++;runCode.textContent=`FORM / ${String(runNo).padStart(3,'0')}`;statusCode.textContent='READY';
  app.className='knees'; show(gameScreen); eyesLayer.classList.remove('active');telemetry.classList.remove('active');telemetryPanel.classList.remove('active');
  scores={knees:{},head:{},eyes:{}};phaseScores={knees:0,head:0,eyes:0};
  renderPose(P.stand);setCue(tutorial?'HOLD':'',tutorial);ignoreUp=true;
}
function kneeFrame(now){if(sub!=='kneesHold')return;const t=(now-holdStart)/1000, p=clamp(t/1.62), ep=ease(p);renderPose(mixPose(P.stand,P.kneel,ep));statusCode.textContent='MOTION';if(tutorial)setCue('RELEASE');raf=requestAnimationFrame(kneeFrame)}
function startKnees(){sub='kneesHold';holdStart=performance.now();statusCode.textContent='CAPTURE';raf=requestAnimationFrame(kneeFrame)}
function endKnees(){
  const t=(performance.now()-holdStart)/1000;kneeRelease=t;cancelAnimationFrame(raf);sub='analyzeKnees';
  const p=clamp(t/1.62),ep=ease(p),pose=mixPose(P.stand,P.kneel,ep);renderPose(pose,{analysis:true});telemetry.classList.add('active');telemetryPanel.classList.add('active');setCue('',false);
  const ideal=1.31,err=t-ideal;const velocity=1.62*(6*p*(1-p));
  scores.knees.timing=gaussian(err,.155);scores.knees.speed=gaussian(velocity-1.504,.33);scores.knees.stability=gaussian(ep-.972,.105);
  phaseScores.knees=.40*scores.knees.timing+.35*scores.knees.speed+.25*scores.knees.stability;
  m1Label.textContent='KNEE ANGLE';m1Value.textContent=`${Math.round(angleABC(pose.hip,pose.knee,pose.ankle))}°`;m2Label.textContent='DESCENT';m2Value.textContent=`${velocity.toFixed(2)} m/s`;statusCode.textContent='ANALYSIS';
  setTimeout(beginHead,520);
}
function beginHead(){
  app.className='head';figureSvg.classList.remove('analyzing');telemetry.classList.remove('active');telemetryPanel.classList.remove('active');
  renderPose(P.kneel,{headMode:true});sub='headReady';statusCode.textContent='READY';setCue(tutorial?'HOLD':'',tutorial);
}
function headFrame(now){if(sub!=='headHold')return;const t=(now-holdStart)/1000,p=clamp(t/2.05),ep=ease(p);renderPose(mixPose(P.kneel,P.bow,ep),{headMode:true});statusCode.textContent='MOTION';if(tutorial)setCue('RELEASE');raf=requestAnimationFrame(headFrame)}
function startHead(){sub='headHold';holdStart=performance.now();raf=requestAnimationFrame(headFrame)}
function releaseHead(){
  const t=(performance.now()-holdStart)/1000;headRelease=t;cancelAnimationFrame(raf);const p=clamp(t/2.05),ep=ease(p);sub='headPause';pauseStart=performance.now();statusCode.textContent='HOLD';setCue(tutorial?'TAP':'',tutorial);
  scores.head.depth=gaussian(ep-.915,.075); const loop=now=>{if(sub!=='headPause')return;const pt=(now-pauseStart)/1000;const wobble=Math.sin((pt-1.62)*4.15)*(.85+Math.min(2.2,pt*.52));renderPose(mixPose(P.kneel,P.bow,ep),{headMode:true,wobble});raf=requestAnimationFrame(loop)};raf=requestAnimationFrame(loop);
}
function finishPause(){
  pauseDuration=(performance.now()-pauseStart)/1000;cancelAnimationFrame(raf);sub='analyzeHead';setCue('',false);const p=clamp(headRelease/2.05),ep=ease(p);const wob=Math.sin((pauseDuration-1.62)*4.15)*(.85+Math.min(2.2,pauseDuration*.52));
  scores.head.pause=gaussian(pauseDuration-1.62,.19);scores.head.stability=gaussian(wob,.42);
  phaseScores.head=(30/85)*scores.head.depth+(35/85)*scores.head.pause+(20/85)*scores.head.stability;
  const pose=renderPose(mixPose(P.kneel,P.bow,ep),{analysis:true,headMode:true,wobble:wob});telemetry.classList.add('active');telemetryPanel.classList.add('active');
  const foreheadGap=Math.max(0,486-(pose.head[1]+24));m1Label.textContent='FOREHEAD GAP';m1Value.textContent=`${(foreheadGap*.43).toFixed(1)} mm`;m2Label.textContent='PAUSE';m2Value.textContent=`${pauseDuration.toFixed(2)} s`;statusCode.textContent='ANALYSIS';
  setTimeout(beginEyesTransition,620);
}
function beginEyesTransition(){
  const mask=$('#transitionMask');mask.classList.add('flash');setTimeout(()=>mask.classList.remove('flash'),360);
  setTimeout(()=>{app.className='eyes';figureSvg.style.display='none';telemetry.classList.remove('active');telemetryPanel.classList.remove('active');eyesLayer.classList.add('active');sub='eyes';eyesStart=performance.now();statusCode.textContent='OCULAR';setCue(tutorial?'TAP':'',tutorial);raf=requestAnimationFrame(eyesFrame)},170);
}
function eyesFrame(now){if(sub!=='eyes')return;const t=(now-eyesStart)/1000, ideal=1.86, d=t-ideal;const off=Math.min(34,Math.abs(d)*22), sign=d<0?-1:1;document.documentElement.style.setProperty('--gx',`${sign*off}px`);document.documentElement.style.setProperty('--gy',`${Math.sin(t*3.1)*off*.18}px`);document.documentElement.style.setProperty('--va',`${sign*Math.min(8,off*.22)}deg`);document.documentElement.style.setProperty('--vaNeg',`${-sign*Math.min(8,off*.22)}deg`);eyeReadout.textContent=`Δ ${off.toFixed(2)}`;raf=requestAnimationFrame(eyesFrame)}
function stopEyes(){
  eyesStop=(performance.now()-eyesStart)/1000;cancelAnimationFrame(raf);sub='eyesAnalyze';setCue('',false);const err=eyesStop-1.86;
  scores.eyes.focus=gaussian(err,.13);scores.eyes.composure=gaussian(err,.105);phaseScores.eyes=(35/85)*scores.eyes.focus+(50/85)*scores.eyes.composure;
  document.documentElement.style.setProperty('--gx','0px');document.documentElement.style.setProperty('--gy','0px');document.documentElement.style.setProperty('--va','0deg');document.documentElement.style.setProperty('--vaNeg','0deg');eyeReadout.textContent='LOCK';statusCode.textContent='VALIDATING';
  if(tutorial){localStorage.setItem(firstPlayKey,'1');tutorial=false}
  setTimeout(showResult,760);
}
function geoTotal(){const w={knees:.25,head:.40,eyes:.35};return 100*Math.exp(Object.entries(w).reduce((s,[k,v])=>s+v*Math.log(Math.max(.01,phaseScores[k])/100),0))}
function verdictFor(v){if(v>=99.995)return'';if(v>=99)return'...';if(v>=95)return'ABSOLUTE COMPOSURE.';if(v>=90)return'EXEMPLARY FORM.';if(v>=80)return'FORM VALIDATED.';if(v>=65)return'FORM COMPROMISED.';if(v>=45)return'INSUFFICIENT.';return'UNSTABLE.'}
function reason(metric,score,val){
  if(score>=96)return metric==='composure'?'ABSOLUTE COMPOSURE.':'PRECISE.';
  if(metric==='timing')return val<1.31?'PREMATURE.':'DELAYED.';
  if(metric==='speed')return val<0?'TOO SLOW.':'TOO FAST.';
  if(metric==='stability')return'UNSTABLE.';
  if(metric==='depth')return val<.915?'TOO SHALLOW.':'TOO DEEP.';
  if(metric==='pause')return val<1.62?'TOO BRIEF.':'TOO LONG.';
  if(metric==='focus')return'UNFOCUSED.';
  if(metric==='composure')return'DISTRACTED.';
  return'FORM COMPROMISED.'
}
function detailMarkup(){
  const kv=(name,score,rs)=>`<div class="detailMetric"><span>${name}</span><span class="score">${fmt(score)}</span></div><div class="detailReason">${rs}</div>`;
  const kneeVel=1.62*(6*clamp(kneeRelease/1.62)*(1-clamp(kneeRelease/1.62)));
  return `<div class="detailGroup"><div class="detailGroupTitle"><span>KNEES</span><span>${fmt(phaseScores.knees)}</span></div>${kv('TIMING',scores.knees.timing,reason('timing',scores.knees.timing,kneeRelease))}${kv('SPEED',scores.knees.speed,reason('speed',scores.knees.speed,kneeVel-1.504))}${kv('STABILITY',scores.knees.stability,reason('stability',scores.knees.stability,0))}</div>`+
  `<div class="detailGroup"><div class="detailGroupTitle"><span>HEAD</span><span>${fmt(phaseScores.head)}</span></div>${kv('DEPTH',scores.head.depth,reason('depth',scores.head.depth,ease(clamp(headRelease/2.05))))}${kv('PAUSE',scores.head.pause,reason('pause',scores.head.pause,pauseDuration))}${kv('STABILITY',scores.head.stability,reason('stability',scores.head.stability,0))}</div>`+
  `<div class="detailGroup"><div class="detailGroupTitle"><span>EYES</span><span>${fmt(phaseScores.eyes)}</span></div>${kv('FOCUS',scores.eyes.focus,reason('focus',scores.eyes.focus,0))}${kv('COMPOSURE',scores.eyes.composure,reason('composure',scores.eyes.composure,0))}</div>`;
}
function showResult(){
  figureSvg.style.display='block';eyesLayer.classList.remove('active');app.className='result';show(resultScreen);state='result';sub='resultSummary';total=geoTotal();
  $('#totalScore').textContent=fmt(total);$('#verdict').textContent=verdictFor(total);$('#sumKnees').textContent=fmt(phaseScores.knees);$('#sumHead').textContent=fmt(phaseScores.head);$('#sumEyes').textContent=fmt(phaseScores.eyes);detailContent.innerHTML=detailMarkup();details.classList.remove('open');phaseSummary.classList.remove('show');resultHint.textContent='';
  const isNew=total>best;if(isNew){best=total;localStorage.setItem(bestKey,best.toFixed(2));updateBest()}$('#bestResult').textContent=isNew?'NEW BEST':'';
  setTimeout(()=>{phaseSummary.classList.add('show');resultHint.textContent='TAP FOR ANALYSIS'},720);
  if(total>=99.995){setTimeout(()=>{perfectWord.classList.add('show');perfectWord.textContent='DOGEZA.'},1800)}
}
function toTitle(){state='title';sub='idle';app.className='';perfectWord.classList.remove('show');details.classList.remove('open');phaseSummary.classList.remove('show');resultHint.textContent='';show(titleScreen);scheduleTitleScan()}
function pointerDown(e){e.preventDefault();if(state==='title'){startRun();return}if(state==='result'){
  if(perfectWord.classList.contains('show')){perfectWord.classList.remove('show');toTitle();return}
  if(sub==='resultSummary'){details.classList.add('open');sub='resultDetails';return}
  if(sub==='resultDetails'){toTitle();return}
}
if(state!=='game')return;
if(sub==='kneesReady')startKnees();else if(sub==='headReady')startHead();else if(sub==='headPause')finishPause();else if(sub==='eyes')stopEyes();
}
function pointerUp(e){e.preventDefault();if(ignoreUp){ignoreUp=false;return}if(state!=='game')return;if(sub==='kneesHold')endKnees();else if(sub==='headHold')releaseHead()}
window.addEventListener('pointerdown',pointerDown,{passive:false});window.addEventListener('pointerup',pointerUp,{passive:false});window.addEventListener('pointercancel',pointerUp,{passive:false});document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
renderTitle();updateBest();scheduleTitleScan();
})();
