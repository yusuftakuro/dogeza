import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host=document.querySelector('#viewport');
const loading=document.querySelector('#loading');
const boneStatus=document.querySelector('#boneStatus');
const poseReadout=document.querySelector('#poseReadout');

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x030405);
scene.fog=new THREE.FogExp2(0x030405,.045);

const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.01,100);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.08;
controls.enablePan=false;
controls.minDistance=1.6;
controls.maxDistance=8;

const grid=new THREE.GridHelper(14,28,0x4b514f,0x151919);
grid.material.transparent=true;
grid.material.opacity=.46;
scene.add(grid);

const axesMat=new THREE.LineBasicMaterial({color:0xdf4936,transparent:true,opacity:.30});
const axisGeo=new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-3,0,0),new THREE.Vector3(3,0,0),
  new THREE.Vector3(0,0,-3),new THREE.Vector3(0,0,3)
]);
scene.add(new THREE.LineSegments(axisGeo,axesMat));

const anchor=new THREE.Group();
scene.add(anchor);

let root=null, bones={}, base={}, helper=null, headShell=null, headWire=null;
let currentPose='stand';

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

function armsDown(){
  qOffset('lArm',-78*d,0,0);
  qOffset('rArm', 78*d,0,0);
}
function armsForward(amount=1){
  // mirrored arm bones need mirrored X rotations.
  qOffset('lArm',(-78+88*amount)*d,0, 12*d);
  qOffset('rArm',( 78-88*amount)*d,0,-12*d);
  qOffset('lFore',-36*amount*d,0,-4*d);
  qOffset('rFore', 36*amount*d,0, 4*d);
}

function updateSkinnedBounds(){
  if(!root)return new THREE.Box3();
  root.updateMatrixWorld(true);
  const box=new THREE.Box3();
  let any=false;
  root.traverse(o=>{
    if(o.isSkinnedMesh){
      o.computeBoundingBox();
      const b=o.boundingBox.clone().applyMatrix4(o.matrixWorld);
      box.union(b); any=true;
    } else if(o.isMesh && o.geometry){
      if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      if(o.geometry.boundingBox){
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); any=true;
      }
    }
  });
  return any?box:new THREE.Box3().setFromObject(root);
}

function alignPoseToFloor(){
  anchor.position.set(0,0,0);
  anchor.updateMatrixWorld(true);
  let box=updateSkinnedBounds();
  if(box.isEmpty())return box;
  const center=new THREE.Vector3(); box.getCenter(center);
  anchor.position.set(-center.x,-box.min.y,-center.z);
  anchor.updateMatrixWorld(true);
  box=updateSkinnedBounds();
  return box;
}

const cameraDirs={
  stand:new THREE.Vector3(2.7,1.15,4.5),
  descent:new THREE.Vector3(2.8,1.15,4.3),
  seiza:new THREE.Vector3(3.1,1.00,3.7),
  hands:new THREE.Vector3(3.4,.85,3.2),
  dogeza:new THREE.Vector3(4.5,.72,.55)
};

function fitCamera(name,box){
  const center=new THREE.Vector3(); box.getCenter(center);
  const size=new THREE.Vector3(); box.getSize(size);
  const radius=Math.max(size.length()*.5,.7);
  const vFov=THREE.MathUtils.degToRad(camera.fov);
  const distV=radius/Math.sin(vFov*.5);
  const hFov=2*Math.atan(Math.tan(vFov*.5)*camera.aspect);
  const distH=radius/Math.sin(Math.max(hFov*.5,.12));
  const dist=Math.max(distV,distH)*1.08;
  const dir=(cameraDirs[name]||cameraDirs.stand).clone().normalize();
  const target=center.clone();
  target.y=Math.max(center.y, size.y*.40);
  camera.position.copy(target).add(dir.multiplyScalar(dist));
  controls.target.copy(target);
  controls.update();
}

function makeHeadShell(){
  const solidMat=new THREE.MeshBasicMaterial({color:0x030405,side:THREE.DoubleSide});
  const wireMat=new THREE.MeshBasicMaterial({
    color:0xe5e9e6,wireframe:true,transparent:true,opacity:.92,side:THREE.DoubleSide
  });
  const geo=new THREE.SphereGeometry(1,18,12);
  headShell=new THREE.Mesh(geo,solidMat);
  headWire=new THREE.Mesh(geo.clone(),wireMat);
  headShell.renderOrder=10;
  headWire.renderOrder=11;
  scene.add(headShell,headWire);

  // derive stable head proportions from neck-head spacing.
  const hp=new THREE.Vector3(), np=new THREE.Vector3();
  bones.head?.getWorldPosition(hp); bones.neck?.getWorldPosition(np);
  const h=Math.max(hp.distanceTo(np)*2.2,.18);
  const w=h*.72, depth=h*.78;
  headShell.scale.set(w*.54,h*.54,depth*.54);
  headWire.scale.copy(headShell.scale).multiplyScalar(1.015);
}
function syncHeadShell(){
  if(!headShell||!bones.head)return;
  const p=new THREE.Vector3(), q=new THREE.Quaternion();
  bones.head.getWorldPosition(p);
  bones.head.getWorldQuaternion(q);
  // shift slightly upward from head-bone origin toward the skull centre.
  const up=new THREE.Vector3(0,1,0).applyQuaternion(q);
  p.addScaledVector(up,.055);
  headShell.position.copy(p); headWire.position.copy(p);
  headShell.quaternion.copy(q); headWire.quaternion.copy(q);
}

function applyPose(name){
  if(!root)return;
  currentPose=name;
  resetPose();
  armsDown();

  if(name==='descent'){
    qOffset('hips',8*d,0,0);
    qOffset('lThigh',-38*d,0,3*d); qOffset('rThigh',-38*d,0,-3*d);
    qOffset('lCalf',72*d,0,0); qOffset('rCalf',72*d,0,0);
    qOffset('lFoot',-26*d,0,0); qOffset('rFoot',-26*d,0,0);
    pOffset('hips',0,-.06,0);
  }

  if(name==='seiza'||name==='hands'||name==='dogeza'){
    qOffset('hips',5*d,0,0);
    qOffset('lThigh',-92*d,0,4*d); qOffset('rThigh',-92*d,0,-4*d);
    qOffset('lCalf',138*d,0,0); qOffset('rCalf',138*d,0,0);
    qOffset('lFoot',-52*d,0,0); qOffset('rFoot',-52*d,0,0);
    pOffset('hips',0,-.16,.01);
  }

  if(name==='hands'){
    qOffset('spine',18*d,0,0); qOffset('spine1',12*d,0,0); qOffset('spine2',8*d,0,0);
    qOffset('neck',-8*d,0,0); qOffset('head',-5*d,0,0);
    armsForward(.68);
  }

  if(name==='dogeza'){
    qOffset('spine',46*d,0,0); qOffset('spine1',30*d,0,0); qOffset('spine2',17*d,0,0);
    qOffset('neck',-18*d,0,0); qOffset('head',-14*d,0,0);
    armsForward(1);
    pOffset('hips',0,-.20,.05);
  }

  root.updateMatrixWorld(true);
  const box=alignPoseToFloor();
  fitCamera(name,box);
  syncHeadShell();

  poseReadout.innerHTML='POSE <b>'+name.toUpperCase()+'</b>';
  document.querySelectorAll('.pose').forEach(el=>el.classList.toggle('active',el.dataset.pose===name));
}

function normalizeModel(obj){
  obj.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(obj);
  const size=new THREE.Vector3(); box.getSize(size);
  const h=Math.max(size.y,.001);
  obj.scale.setScalar(1.82/h);
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
    root.traverse(o=>{ if(o.isSkinnedMesh&&o.skeleton)o.skeleton.pose(); });
  }
  normalizeModel(root);

  let skinned=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(o.isSkinnedMesh)skinned++;
    o.material=new THREE.MeshBasicMaterial({
      color:0xe5e9e6,
      wireframe:true,
      transparent:true,
      opacity:.66,
      side:THREE.DoubleSide
    });
    o.frustumCulled=false;
  });

  anchor.add(root);
  captureBones();

  helper=new THREE.SkeletonHelper(root);
  helper.material.color.set(0xdf4936);
  helper.material.transparent=true;
  helper.material.opacity=.20;
  anchor.add(helper);

  makeHeadShell();
  applyPose('stand');

  boneStatus.textContent += ' / SKIN '+skinned;
  loading.classList.add('hide');
  setTimeout(()=>loading.remove(),500);
},undefined,err=>{
  console.error(err);
  loading.innerHTML='<div id="error">MODEL LOAD FAILED<br><small>'+String(err.message||err)+'</small></div>';
});

document.querySelectorAll('.pose').forEach(btn=>{
  btn.addEventListener('click',e=>{
    e.preventDefault();
    if(root)applyPose(btn.dataset.pose);
  });
});

function resize(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  if(root){
    const box=updateSkinnedBounds();
    fitCamera(currentPose,box);
  }
}
addEventListener('resize',resize);

function tick(){
  requestAnimationFrame(tick);
  syncHeadShell();
  controls.update();
  renderer.render(scene,camera);
}
tick();
