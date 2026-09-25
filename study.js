import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host=document.querySelector('#viewport');
const loading=document.querySelector('#loading');
const boneStatus=document.querySelector('#boneStatus');
const poseReadout=document.querySelector('#poseReadout');

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x030405);
scene.fog=new THREE.FogExp2(0x030405,.055);

const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.01,100);
camera.position.set(3.0,1.85,4.6);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.08;
controls.enablePan=false;
controls.minDistance=2.3;
controls.maxDistance=7;
controls.target.set(0,1.0,0);

const grid=new THREE.GridHelper(14,28,0x3b4140,0x171b1b);
grid.material.transparent=true;
grid.material.opacity=.52;
grid.position.y=0;
scene.add(grid);

const axesMat=new THREE.LineBasicMaterial({color:0xdf4936,transparent:true,opacity:.34});
const axisPts=[
  new THREE.Vector3(-3,0,0),new THREE.Vector3(3,0,0),
  new THREE.Vector3(0,0,-3),new THREE.Vector3(0,0,3)
];
const axisGeo=new THREE.BufferGeometry().setFromPoints(axisPts);
scene.add(new THREE.LineSegments(axisGeo,axesMat));

let root=null, bones={}, base={}, helper=null;
const aliases={
  hips:['Hips','hips','pelvis'],
  spine:['Spine','spine','spine_01'],
  spine1:['Spine1','Chest','spine_02'],
  spine2:['Spine2','UpperChest','spine_03'],
  neck:['Neck','neck','neck_01'],
  head:['Head','head'],
  lShoulder:['LeftShoulder','leftshoulder','clavicle_l'],
  rShoulder:['RightShoulder','rightshoulder','clavicle_r'],
  lArm:['LeftArm','leftarm','upperarm_l'],
  rArm:['RightArm','rightarm','upperarm_r'],
  lFore:['LeftForeArm','LeftForearm','leftforearm','lowerarm_l'],
  rFore:['RightForeArm','RightForearm','rightforearm','lowerarm_r'],
  lHand:['LeftHand','lefthand','hand_l'],
  rHand:['RightHand','righthand','hand_r'],
  lThigh:['LeftUpLeg','leftupleg','thigh_l'],
  rThigh:['RightUpLeg','rightupleg','thigh_r'],
  lCalf:['LeftLeg','leftleg','calf_l'],
  rCalf:['RightLeg','rightleg','calf_r'],
  lFoot:['LeftFoot','leftfoot','foot_l'],
  rFoot:['RightFoot','rightfoot','foot_r']
};

function findByAliases(list){
  for(const n of list){
    const exact=root.getObjectByName(n);
    if(exact)return exact;
  }
  const lower=list.map(s=>s.toLowerCase());
  let hit=null;
  root.traverse(o=>{
    if(hit)return;
    const n=(o.name||'').toLowerCase();
    if(lower.includes(n))hit=o;
  });
  return hit;
}
function captureBones(){
  for(const [k,list] of Object.entries(aliases)){
    const b=findByAliases(list);
    if(b){
      bones[k]=b;
      base[k]={q:b.quaternion.clone(),p:b.position.clone()};
    }
  }
  boneStatus.textContent='BONES '+Object.keys(bones).length+'/'+Object.keys(aliases).length;
}
function qOffset(key,x=0,y=0,z=0){
  const b=bones[key]; if(!b)return;
  b.quaternion.copy(base[key].q);
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z,'XYZ'));
  b.quaternion.multiply(q);
}
function pOffset(key,x=0,y=0,z=0){
  const b=bones[key]; if(!b)return;
  b.position.copy(base[key].p).add(new THREE.Vector3(x,y,z));
}
function resetPose(){
  for(const [k,b] of Object.entries(bones)){
    b.quaternion.copy(base[k].q);
    b.position.copy(base[k].p);
  }
}
const d=Math.PI/180;

// Offsets are intentionally conservative. This page is a pose study, not final gameplay.
function applyPose(name){
  resetPose();
  if(name==='descent'){
    qOffset('hips',10*d,0,0);
    qOffset('lThigh',-42*d,0,3*d); qOffset('rThigh',-42*d,0,-3*d);
    qOffset('lCalf',76*d,0,0); qOffset('rCalf',76*d,0,0);
    qOffset('lFoot',-28*d,0,0); qOffset('rFoot',-28*d,0,0);
    pOffset('hips',0,-.08,0);
  }
  if(name==='seiza'||name==='hands'||name==='dogeza'){
    qOffset('hips',6*d,0,0);
    qOffset('lThigh',-88*d,0,5*d); qOffset('rThigh',-88*d,0,-5*d);
    qOffset('lCalf',132*d,0,0); qOffset('rCalf',132*d,0,0);
    qOffset('lFoot',-48*d,0,0); qOffset('rFoot',-48*d,0,0);
    pOffset('hips',0,-.18,.02);
  }
  if(name==='hands'||name==='dogeza'){
    qOffset('spine',28*d,0,0); qOffset('spine1',18*d,0,0); qOffset('spine2',12*d,0,0);
    qOffset('neck',-12*d,0,0); qOffset('head',-8*d,0,0);
    qOffset('lArm',72*d,0,18*d); qOffset('rArm',72*d,0,-18*d);
    qOffset('lFore',-32*d,0,0); qOffset('rFore',-32*d,0,0);
  }
  if(name==='dogeza'){
    qOffset('spine',52*d,0,0); qOffset('spine1',34*d,0,0); qOffset('spine2',18*d,0,0);
    qOffset('neck',-24*d,0,0); qOffset('head',-18*d,0,0);
    qOffset('lArm',92*d,0,14*d); qOffset('rArm',92*d,0,-14*d);
    qOffset('lFore',-48*d,0,0); qOffset('rFore',-48*d,0,0);
    pOffset('hips',0,-.23,.07);
  }
  poseReadout.innerHTML='POSE <b>'+name.toUpperCase()+'</b>';
  document.querySelectorAll('.pose').forEach(el=>el.classList.toggle('active',el.dataset.pose===name));
}

function normalizeModel(obj){
  obj.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(obj);
  const size=new THREE.Vector3(); box.getSize(size);
  const h=Math.max(size.y,.001);
  const s=1.82/h;
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  const box2=new THREE.Box3().setFromObject(obj);
  const c=new THREE.Vector3(); box2.getCenter(c);
  obj.position.x-=c.x;
  obj.position.z-=c.z;
  obj.position.y-=box2.min.y;
  obj.updateMatrixWorld(true);
}

const modelURL='https://cdn.jsdelivr.net/gh/UMRAM-Bilkent/supine-human-model@main/assets/human.glb';
new GLTFLoader().load(modelURL,gltf=>{
  root=gltf.scene;
  if(gltf.animations?.length){
    root.traverse(o=>{
      if(o.isSkinnedMesh && o.skeleton)o.skeleton.pose();
    });
  }
  normalizeModel(root);
  let skinned=0;
  root.traverse(o=>{
    if(o.isMesh){
      if(o.isSkinnedMesh)skinned++;
      o.material=new THREE.MeshBasicMaterial({
        color:0xe5e9e6,
        wireframe:true,
        transparent:true,
        opacity:.78,
        side:THREE.DoubleSide
      });
      o.frustumCulled=false;
    }
  });
  scene.add(root);
  captureBones();
  helper=new THREE.SkeletonHelper(root);
  helper.material.color.set(0xdf4936);
  helper.material.transparent=true;
  helper.material.opacity=.25;
  scene.add(helper);
  applyPose('stand');
  boneStatus.textContent += ' / SKIN '+skinned;
  loading.classList.add('hide');
  setTimeout(()=>loading.remove(),500);
},undefined,err=>{
  console.error(err);
  loading.innerHTML='<div id="error">MODEL LOAD FAILED<br><small>'+String(err.message||err)+'</small></div>';
});

document.querySelectorAll('.pose').forEach(btn=>{
  btn.addEventListener('click',e=>{e.preventDefault();if(root)applyPose(btn.dataset.pose)});
});

function resize(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}
addEventListener('resize',resize);

const clock=new THREE.Clock();
function tick(){
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene,camera);
}
tick();
