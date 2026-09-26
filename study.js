import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const host=document.querySelector('#viewport');
const loading=document.querySelector('#loading');
const boneStatus=document.querySelector('#boneStatus');
const poseReadout=document.querySelector('#poseReadout');

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x030405);
scene.fog=new THREE.FogExp2(0x030405,.042);

const camera=new THREE.PerspectiveCamera(31,innerWidth/innerHeight,.01,100);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.08;
controls.enablePan=false;
controls.minDistance=1.5;
controls.maxDistance=8;

const grid=new THREE.GridHelper(14,28,0x454b49,0x141818);
grid.material.transparent=true;
grid.material.opacity=.48;
scene.add(grid);

const axesMat=new THREE.LineBasicMaterial({color:0xdf4936,transparent:true,opacity:.30});
const axisGeo=new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-3,0,0),new THREE.Vector3(3,0,0),
  new THREE.Vector3(0,0,-3),new THREE.Vector3(0,0,3)
]);
scene.add(new THREE.LineSegments(axisGeo,axesMat));

const anchor=new THREE.Group();
scene.add(anchor);

let root=null, helper=null, headShell=null, headWire=null;
let bones={}, base={}, restFrames={}, currentPose='stand';
let bodySide=new THREE.Vector3(1,0,0), bodyUp=new THREE.Vector3(0,1,0), bodyForward=new THREE.Vector3(0,0,1);

const aliases={
  hips:['Hips'], spine:['Spine'], spine1:['Spine1'], spine2:['Spine2'],
  neck:['Neck'], head:['Head'], headTop:['HeadTop_End'],
  lShoulder:['LeftShoulder'], rShoulder:['RightShoulder'],
  lArm:['LeftArm'], rArm:['RightArm'],
  lFore:['LeftForeArm'], rFore:['RightForeArm'],
  lHand:['LeftHand'], rHand:['RightHand'],
  lIndex:['LeftHandIndex1'], rIndex:['RightHandIndex1'],
  lThigh:['LeftUpLeg'], rThigh:['RightUpLeg'],
  lCalf:['LeftLeg'], rCalf:['RightLeg'],
  lFoot:['LeftFoot'], rFoot:['RightFoot'],
  lToe:['LeftToeBase'], rToe:['RightToeBase'],
  lToeEnd:['LeftToe_End'], rToeEnd:['RightToe_End']
};

const childMap={
  spine:'spine1', spine1:'spine2', spine2:'neck', neck:'head',
  lArm:'lFore', rArm:'rFore', lFore:'lHand', rFore:'rHand',
  lHand:'lIndex', rHand:'rIndex',
  lThigh:'lCalf', rThigh:'rCalf', lCalf:'lFoot', rCalf:'rFoot',
  lFoot:'lToe', rFoot:'rToe', lToe:'lToeEnd', rToe:'rToeEnd'
};

function find(nameList){
  for(const n of nameList){
    const hit=root.getObjectByName(n);
    if(hit)return hit;
  }
  return null;
}
function captureBones(){
  for(const [k,list] of Object.entries(aliases)){
    const b=find(list);
    if(b){
      bones[k]=b;
      base[k]={q:b.quaternion.clone(),p:b.position.clone()};
    }
  }
  root.updateMatrixWorld(true);

  const pos=k=>{
    const p=new THREE.Vector3();
    bones[k]?.getWorldPosition(p);
    return p;
  };
  const ls=pos('lShoulder'), rs=pos('rShoulder');
  const hips=pos('hips'), head=pos('head');
  const lf=pos('lFoot'), rf=pos('rFoot'), lt=pos('lToe'), rt=pos('rToe');

  bodyUp=head.clone().sub(hips).normalize();
  bodySide=rs.clone().sub(ls);
  bodySide.sub(bodyUp.clone().multiplyScalar(bodySide.dot(bodyUp))).normalize();
  bodyForward=bodySide.clone().cross(bodyUp).normalize();

  const footForward=lt.clone().sub(lf).add(rt.clone().sub(rf)).normalize();
  if(bodyForward.dot(footForward)<0) bodyForward.negate();

  for(const [key,childKey] of Object.entries(childMap)){
    const b=bones[key], ch=bones[childKey];
    if(!b||!ch)continue;

    const bp=new THREE.Vector3(), cp=new THREE.Vector3();
    const bq=new THREE.Quaternion();
    b.getWorldPosition(bp); ch.getWorldPosition(cp); b.getWorldQuaternion(bq);

    const dirWorld=cp.sub(bp).normalize();
    let sideWorld=bodySide.clone().sub(dirWorld.clone().multiplyScalar(bodySide.dot(dirWorld)));
    if(sideWorld.lengthSq()<1e-6){
      sideWorld=bodyForward.clone().sub(dirWorld.clone().multiplyScalar(bodyForward.dot(dirWorld)));
    }
    sideWorld.normalize();
    const normalWorld=sideWorld.clone().cross(dirWorld).normalize();

    const inv=bq.clone().invert();
    restFrames[key]={
      dirLocal:dirWorld.clone().applyQuaternion(inv).normalize(),
      sideLocal:sideWorld.clone().applyQuaternion(inv).normalize(),
      normalLocal:normalWorld.clone().applyQuaternion(inv).normalize()
    };
  }
  boneStatus.textContent='BONES '+Object.keys(bones).length+'/'+Object.keys(aliases).length;
}
function resetPose(){
  for(const [k,b] of Object.entries(bones)){
    if(base[k]){
      b.quaternion.copy(base[k].q);
      b.position.copy(base[k].p);
    }
  }
  root.updateMatrixWorld(true);
}
const V=(x,y,z)=>bodySide.clone().multiplyScalar(x)
  .add(bodyUp.clone().multiplyScalar(y))
  .add(bodyForward.clone().multiplyScalar(z))
  .normalize();

function aimBone(key,childKey,targetDir,targetSideHint=bodySide){
  const b=bones[key], c=bones[childKey], frame=restFrames[key];
  if(!b||!c||!frame)return;
  root.updateMatrixWorld(true);

  const target=targetDir.clone().normalize();
  let side=targetSideHint.clone().sub(target.clone().multiplyScalar(targetSideHint.dot(target)));
  if(side.lengthSq()<1e-6){
    side=new THREE.Vector3(0,0,1).sub(target.clone().multiplyScalar(target.z));
  }
  side.normalize();
  const normal=side.clone().cross(target).normalize();
  side=target.clone().cross(normal).normalize();

  const localBasis=new THREE.Matrix4().makeBasis(
    frame.sideLocal.clone(),
    frame.dirLocal.clone(),
    frame.normalLocal.clone()
  );
  const worldBasis=new THREE.Matrix4().makeBasis(side,target,normal);
  const desiredWorldM=worldBasis.clone().multiply(localBasis.clone().invert());
  const desiredWorldQ=new THREE.Quaternion().setFromRotationMatrix(desiredWorldM);

  const parentQ=new THREE.Quaternion();
  if(b.parent)b.parent.getWorldQuaternion(parentQ); else parentQ.identity();
  b.quaternion.copy(parentQ.invert().multiply(desiredWorldQ));
  root.updateMatrixWorld(true);
}

function aimBoneTowardPoint(key,childKey,targetPoint,targetSideHint=bodySide){
  const b=bones[key];
  if(!b)return;
  const origin=new THREE.Vector3();
  b.getWorldPosition(origin);
  const dir=targetPoint.clone().sub(origin);
  if(dir.lengthSq()<1e-8)return;
  aimBone(key,childKey,dir.normalize(),targetSideHint);
}

function poseArmsAtSides(){
  aimBone('lArm','lFore',V(-.10,-.995,.02));
  aimBone('rArm','rFore',V(.10,-.995,.02));
  aimBone('lFore','lHand',V(.02,-.995,.08));
  aimBone('rFore','rHand',V(-.02,-.995,.08));
  aimBone('lHand','lIndex',V(0,-.2,.98),bodySide.clone().negate());
  aimBone('rHand','rIndex',V(0,-.2,.98),bodySide.clone().negate());
}

function poseLegsStand(){
  aimBone('lThigh','lCalf',V(-.03,-1,.01));
  aimBone('rThigh','rCalf',V(.03,-1,.01));
  aimBone('lCalf','lFoot',V(0,-1,.02));
  aimBone('rCalf','rFoot',V(0,-1,.02));
  aimBone('lFoot','lToe',V(0,0,1));
  aimBone('rFoot','rToe',V(0,0,1));
  aimBone('lToe','lToeEnd',V(0,0,1));
  aimBone('rToe','rToeEnd',V(0,0,1));
}

function poseLegsDescent(){
  // Knees move forward and down while the lower legs remain beneath the body.
  aimBone('lThigh','lCalf',V(-.03,-.82,.57));
  aimBone('rThigh','rCalf',V(.03,-.82,.57));
  aimBone('lCalf','lFoot',V(0,-.86,-.50));
  aimBone('rCalf','rFoot',V(0,-.86,-.50));
  aimBone('lFoot','lToe',V(0,0,1));
  aimBone('rFoot','rToe',V(0,0,1));
  aimBone('lToe','lToeEnd',V(0,0,1));
  aimBone('rToe','rToeEnd',V(0,0,1));
}

function poseLegsSeiza(){
  // Hip -> knee: forward/down. Knee -> ankle: backward and almost horizontal.
  // This is the defining folded-leg structure of seiza.
  aimBone('lThigh','lCalf',V(-.035,-.52,.85));
  aimBone('rThigh','rCalf',V(.035,-.52,.85));
  aimBone('lCalf','lFoot',V(0,-.16,-.987));
  aimBone('rCalf','rFoot',V(0,-.16,-.987));
  // Instep lies along the floor behind the ankle.
  aimBone('lFoot','lToe',V(0,0,-1));
  aimBone('rFoot','rToe',V(0,0,-1));
  aimBone('lToe','lToeEnd',V(0,0,-1));
  aimBone('rToe','rToeEnd',V(0,0,-1));
}

function poseTorsoUpright(){
  aimBone('spine','spine1',V(0,1,.015));
  aimBone('spine1','spine2',V(0,1,.01));
  aimBone('spine2','neck',V(0,1,.015));
  aimBone('neck','head',V(0,.995,.10));
}

function poseTorsoLean(){
  aimBone('spine','spine1',V(0,.90,.44));
  aimBone('spine1','spine2',V(0,.84,.54));
  aimBone('spine2','neck',V(0,.78,.63));
  aimBone('neck','head',V(0,.70,.71));
}

function poseTorsoDogeza(){
  // Pelvis stays over the heels; the trunk progresses forward and down.
  // Roll is locked by aimBone's anatomical side-frame constraint.
  aimBone('spine','spine1',V(0,-.50,.866));
  aimBone('spine1','spine2',V(0,-.58,.815));
  aimBone('spine2','neck',V(0,-.78,.626));
  aimBone('neck','head',V(0,-.98,.199));
}

function poseHandsOnThighs(){
  // Upper arms hang naturally beside the torso.
  aimBone('lArm','lFore',V(-.035,-.985,.17));
  aimBone('rArm','rFore',V(.035,-.985,.17));
  root.updateMatrixWorld(true);

  // Put each wrist physically on top of its thigh instead of merely pointing forward.
  const lHip=point('lThigh'), rHip=point('rThigh');
  const lKnee=point('lCalf'), rKnee=point('rCalf');

  const lWristTarget=new THREE.Vector3().lerpVectors(lHip,lKnee,.42).addScaledVector(bodyUp,.045);
  const rWristTarget=new THREE.Vector3().lerpVectors(rHip,rKnee,.42).addScaledVector(bodyUp,.045);

  aimBoneTowardPoint('lFore','lHand',lWristTarget);
  aimBoneTowardPoint('rFore','rHand',rWristTarget);
  root.updateMatrixWorld(true);

  // Fingers follow the slope of the thighs toward the knees; palm stays down.
  const lThighDir=lKnee.clone().sub(lHip).normalize();
  const rThighDir=rKnee.clone().sub(rHip).normalize();
  aimBone('lHand','lIndex',lThighDir,bodySide.clone().negate());
  aimBone('rHand','rIndex',rThighDir,bodySide.clone().negate());
}

function poseHandsApproachFloor(){
  aimBone('lArm','lFore',V(-.10,-.48,.87));
  aimBone('rArm','rFore',V(.10,-.48,.87));
  aimBone('lFore','lHand',V(.02,-.42,.907));
  aimBone('rFore','rHand',V(-.02,-.42,.907));
  aimBone('lHand','lIndex',V(0,-.08,.997),bodySide.clone().negate());
  aimBone('rHand','rIndex',V(0,-.08,.997),bodySide.clone().negate());
}

function poseHandsDogeza(){
  // Hands should end ahead of the knees, palms/fingers directed forward on the floor.
  aimBone('lArm','lFore',V(-.70,-.50,.51));
  aimBone('rArm','rFore',V(.70,-.50,.51));
  aimBone('lFore','lHand',V(.70,-.50,.51));
  aimBone('rFore','rHand',V(-.70,-.50,.51));
  aimBone('lHand','lIndex',V(0,0,1),bodySide.clone().negate());
  aimBone('rHand','rIndex',V(0,0,1),bodySide.clone().negate());
}

function updateBounds(){
  root.updateMatrixWorld(true);
  const box=new THREE.Box3();
  let found=false;
  root.traverse(o=>{
    if(o.isSkinnedMesh){
      o.computeBoundingBox();
      if(o.boundingBox){
        box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
        found=true;
      }
    }
  });
  return found?box:new THREE.Box3().setFromObject(root);
}

function alignToFloorAndCenter(fixedFloorY=null){
  anchor.position.set(0,fixedFloorY ?? 0,0);
  anchor.updateMatrixWorld(true);
  let box=updateBounds();
  const center=new THREE.Vector3(); box.getCenter(center);

  anchor.position.x-=center.x;
  anchor.position.z-=center.z;
  if(fixedFloorY===null){
    anchor.position.y-=box.min.y;
  }
  anchor.updateMatrixWorld(true);
  return updateBounds();
}

function getSeizaFloorOffset(){
  // Compute the floor once from the upright seiza pose.
  // HANDS and DOGEZA must reuse this vertical anchor so lowering the hands/head
  // never lifts the knees and lower legs away from the floor.
  resetPose();
  anchor.position.set(0,0,0);
  poseLegsSeiza();
  poseTorsoUpright();
  poseHandsOnThighs();
  anchor.updateMatrixWorld(true);
  const box=updateBounds();
  return -box.min.y;
}

const cameraDirs={
  stand:V(2.8,1.1,4.6),
  descent:V(2.9,1.0,4.3),
  seiza:V(5.0,.42,.55),
  hands:V(5.0,.34,.45),
  dogeza:V(5.0,.26,.30)
};
function fitCamera(name,box){
  const center=new THREE.Vector3(); box.getCenter(center);
  const size=new THREE.Vector3(); box.getSize(size);
  const radius=Math.max(size.length()*.5,.65);
  const vf=THREE.MathUtils.degToRad(camera.fov);
  const hf=2*Math.atan(Math.tan(vf*.5)*camera.aspect);
  const dist=Math.max(radius/Math.sin(vf*.5),radius/Math.sin(Math.max(hf*.5,.12)))*1.06;
  const target=center.clone();
  target.y=Math.max(center.y,size.y*.40);
  camera.position.copy(target).add(cameraDirs[name].clone().multiplyScalar(dist));
  controls.target.copy(target);
  controls.update();
}

function makeHeadShell(){
  const geo=new THREE.SphereGeometry(1,22,16);
  headShell=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x030405}));
  headWire=new THREE.Mesh(geo.clone(),new THREE.MeshBasicMaterial({
    color:0xe6e9e6,wireframe:true,transparent:true,opacity:.94
  }));
  // QA probe only. Never add these helper meshes to the rendered scene.
  headShell.visible=false;
  headWire.visible=false;

  const hp=new THREE.Vector3(), np=new THREE.Vector3();
  bones.head.getWorldPosition(hp); bones.neck.getWorldPosition(np);
  const h=Math.max(hp.distanceTo(np)*2.25,.18);
  headShell.scale.set(h*.37,h*.50,h*.40);
  headWire.scale.copy(headShell.scale).multiplyScalar(1.012);
}
function syncHeadShell(){
  if(!headShell||!bones.head)return;
  const p=new THREE.Vector3(), q=new THREE.Quaternion();
  bones.head.getWorldPosition(p);
  bones.head.getWorldQuaternion(q);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(q);
  p.addScaledVector(up,.055);
  headShell.position.copy(p); headWire.position.copy(p);
  headShell.quaternion.copy(q); headWire.quaternion.copy(q);
}

function point(key){
  const p=new THREE.Vector3();
  if(bones[key])bones[key].getWorldPosition(p);
  return p;
}
function worldVectorFromLocal(key,local){
  const b=bones[key];
  if(!b)return new THREE.Vector3();
  const q=new THREE.Quaternion();
  b.getWorldQuaternion(q);
  return local.clone().applyQuaternion(q).normalize();
}
function palmNormal(key){
  const frame=restFrames[key];
  if(!frame)return new THREE.Vector3();
  return worldVectorFromLocal(key,frame.normalLocal);
}
function fingerAxis(key){
  const frame=restFrames[key];
  if(!frame)return new THREE.Vector3();
  return worldVectorFromLocal(key,frame.dirLocal);
}
function surfaceNormal(key){
  const frame=restFrames[key];
  if(!frame)return new THREE.Vector3();
  return worldVectorFromLocal(key,frame.normalLocal);
}
function clampHeadShellAboveFloor(minGap=.006){
  if(!headWire||!bones.head)return 0;
  syncHeadShell();
  const box=new THREE.Box3().setFromObject(headWire);
  if(box.min.y>=minGap)return 0;
  const correction=Math.min(.05,minGap-box.min.y);
  const b=bones.head;
  const parentQ=new THREE.Quaternion();
  if(b.parent)b.parent.getWorldQuaternion(parentQ); else parentQ.identity();
  const localDelta=new THREE.Vector3(0,correction,0).applyQuaternion(parentQ.invert());
  b.position.add(localDelta);
  root.updateMatrixWorld(true);
  syncHeadShell();
  return correction;
}
function qaSnapshot(name){
  root.updateMatrixWorld(true);
  const ls=point('lShoulder'), rs=point('rShoulder');
  const lh=point('lThigh'), rh=point('rThigh');
  const lk=point('lCalf'), rk=point('rCalf');
  const la=point('lFoot'), ra=point('rFoot');
  const lw=point('lHand'), rw=point('rHand');
  const head=point('head'), hips=point('hips');
  const lPalm=palmNormal('lHand'), rPalm=palmNormal('rHand');
  const lFinger=fingerAxis('lHand'), rFinger=fingerAxis('rHand');
  const lFootAxis=fingerAxis('lFoot'), rFootAxis=fingerAxis('rFoot');
  const lFootNormal=surfaceNormal('lFoot'), rFootNormal=surfaceNormal('rFoot');
  syncHeadShell();
  const headVisualBox=headWire?new THREE.Box3().setFromObject(headWire):null;

  const axisCheck=(a,b)=>{
    const v=b.clone().sub(a);
    const len=Math.max(v.length(),1e-9);
    v.divideScalar(len);
    const d=a.clone().sub(b);
    return {
      sideAlignment:+Math.abs(v.dot(bodySide)).toFixed(4),
      upDelta:+Math.abs(d.dot(bodyUp)).toFixed(4),
      forwardDelta:+Math.abs(d.dot(bodyForward)).toFixed(4)
    };
  };
  const coords=p=>({
    side:+p.dot(bodySide).toFixed(4),
    up:+p.dot(bodyUp).toFixed(4),
    forward:+p.dot(bodyForward).toFixed(4)
  });
  const q={
    pose:name,
    points:{
      hips:coords(point('hips')),
      head:coords(point('head')),
      neck:coords(point('neck')),
      lShoulder:coords(point('lArm')),
      rShoulder:coords(point('rArm')),
      lElbow:coords(point('lFore')),
      rElbow:coords(point('rFore')),
      lWrist:coords(point('lHand')),
      rWrist:coords(point('rHand')),
      lHip:coords(point('lThigh')),
      rHip:coords(point('rThigh')),
      lKnee:coords(point('lCalf')),
      rKnee:coords(point('rCalf')),
      lAnkle:coords(point('lFoot')),
      rAnkle:coords(point('rFoot')),
      lToe:coords(point('lToe')),
      rToe:coords(point('rToe')),
      lToeEnd:coords(point('lToeEnd')),
      rToeEnd:coords(point('rToeEnd'))
    },
    shoulder:axisCheck(ls,rs),
    hip:axisCheck(lh,rh),
    knee:axisCheck(lk,rk),
    ankle:axisCheck(la,ra),
    symmetry:{
      handsUp:+Math.abs(lw.clone().sub(rw).dot(bodyUp)).toFixed(4),
      handsForward:+Math.abs(lw.clone().sub(rw).dot(bodyForward)).toFixed(4)
    },
    surfaces:{
      leftPalmDown:+(-lPalm.dot(bodyUp)).toFixed(4),
      rightPalmDown:+(-rPalm.dot(bodyUp)).toFixed(4),
      leftFingerFloorSlope:+Math.abs(lFinger.dot(bodyUp)).toFixed(4),
      rightFingerFloorSlope:+Math.abs(rFinger.dot(bodyUp)).toFixed(4),
      leftFootFloorSlope:+Math.abs(lFootAxis.dot(bodyUp)).toFixed(4),
      rightFootFloorSlope:+Math.abs(rFootAxis.dot(bodyUp)).toFixed(4),
      leftFootPlaneFlat:+Math.abs(lFootNormal.dot(bodyUp)).toFixed(4),
      rightFootPlaneFlat:+Math.abs(rFootNormal.dot(bodyUp)).toFixed(4),
      headVisualMinY:headVisualBox?+headVisualBox.min.y.toFixed(4):null
    },
    landmarks:{
      headUp:+head.dot(bodyUp).toFixed(4),
      hipUp:+hips.dot(bodyUp).toFixed(4),
      handUp:+((lw.dot(bodyUp)+rw.dot(bodyUp))/2).toFixed(4),
      kneeUp:+((lk.dot(bodyUp)+rk.dot(bodyUp))/2).toFixed(4),
      shoulderUp:+((ls.dot(bodyUp)+rs.dot(bodyUp))/2).toFixed(4),
      headForward:+head.dot(bodyForward).toFixed(4),
      hipForward:+hips.dot(bodyForward).toFixed(4),
      handForward:+((lw.dot(bodyForward)+rw.dot(bodyForward))/2).toFixed(4),
      kneeForward:+((lk.dot(bodyForward)+rk.dot(bodyForward))/2).toFixed(4)
    }
  };
  q.pass={
    noRoll:q.shoulder.sideAlignment>.92 && q.hip.sideAlignment>.92 && q.knee.sideAlignment>.90,
    bilateral:q.shoulder.upDelta<.08 && q.hip.upDelta<.08 && q.knee.upDelta<.08 && q.symmetry.handsUp<.10,
    palmsDown:(
      (name==='stand'||name==='descent'||name==='seiza'||name==='hands'||name==='dogeza')
      ? q.surfaces.leftPalmDown>.55 && q.surfaces.rightPalmDown>.55
      : true
    ),
    feetFlat:(
      name==='stand'||name==='descent'||name==='seiza'||name==='hands'||name==='dogeza'
      ? q.surfaces.leftFootFloorSlope<.12 &&
        q.surfaces.rightFootFloorSlope<.12 &&
        q.surfaces.leftFootPlaneFlat>.92 &&
        q.surfaces.rightFootPlaneFlat>.92
      : true
    ),
    dogezaGeometry:name!=='dogeza' || (
      q.landmarks.headUp < q.landmarks.kneeUp + .04 &&
      q.landmarks.headUp < q.landmarks.hipUp - .20 &&
      q.landmarks.handUp > -.01 &&
      q.landmarks.handUp < q.landmarks.kneeUp - .04 &&
      ((q.shoulderUp ?? ((q.points.lShoulder.up+q.points.rShoulder.up)/2)) < q.landmarks.hipUp - .10) &&
      q.landmarks.headForward > q.landmarks.hipForward + .22 &&
      q.landmarks.handForward > q.landmarks.headForward + .06 &&
      q.landmarks.handForward < q.landmarks.headForward + .28 &&
      q.surfaces.leftFingerFloorSlope<.10 &&
      q.surfaces.rightFingerFloorSlope<.10 &&
      q.surfaces.headVisualMinY>=0
    )
  };
  q.pass.all=q.pass.noRoll&&q.pass.bilateral&&q.pass.palmsDown&&q.pass.feetFlat&&q.pass.dogezaGeometry;
  window.__DOGEZA_QA__=q;

  if(new URLSearchParams(location.search).get('qa')==='1'){
    let pre=document.getElementById('qaData');
    if(!pre){
      pre=document.createElement('pre');
      pre.id='qaData';
      pre.style.cssText='position:fixed;left:8px;top:150px;z-index:99;background:#000d;color:#fff;font:10px/1.35 monospace;padding:8px;max-width:94vw;white-space:pre-wrap;pointer-events:none';
      document.body.appendChild(pre);
    }
    pre.textContent=JSON.stringify(q,null,2);
  }
}

function applyPose(name){
  if(!root)return;
  currentPose=name;

  let lockedFloorY=null;
  if(name==='hands'||name==='dogeza'){
    lockedFloorY=getSeizaFloorOffset();
  }

  resetPose();
  anchor.position.set(0,0,0);

  if(name==='stand'){
    poseLegsStand(); poseTorsoUpright(); poseArmsAtSides();
  } else if(name==='descent'){
    poseLegsDescent(); poseTorsoUpright(); poseArmsAtSides();
  } else if(name==='seiza'){
    poseLegsSeiza(); poseTorsoUpright(); poseHandsOnThighs();
  } else if(name==='hands'){
    poseLegsSeiza(); poseTorsoLean(); poseHandsApproachFloor();
  } else if(name==='dogeza'){
    poseLegsSeiza(); poseTorsoDogeza(); poseHandsDogeza();
  }

  let box=alignToFloorAndCenter(lockedFloorY);
  syncHeadShell();
  if(name==='dogeza'){
    clampHeadShellAboveFloor(.006);
    box=updateBounds();
  }
  fitCamera(name,box);
  syncHeadShell();
  qaSnapshot(name);

  poseReadout.innerHTML='POSE <b>'+name.toUpperCase()+'</b>';
  document.querySelectorAll('.pose').forEach(el=>el.classList.toggle('active',el.dataset.pose===name));
}

function normalizeModel(obj){
  obj.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(obj);
  const size=new THREE.Vector3(); box.getSize(size);
  obj.scale.setScalar(1.82/Math.max(size.y,.001));
  obj.updateMatrixWorld(true);
  const b2=new THREE.Box3().setFromObject(obj);
  const c=new THREE.Vector3(); b2.getCenter(c);
  obj.position.x-=c.x; obj.position.z-=c.z; obj.position.y-=b2.min.y;
  obj.updateMatrixWorld(true);
}

const modelURL='https://cdn.jsdelivr.net/gh/UMRAM-Bilkent/supine-human-model@main/assets/human.glb';
new GLTFLoader().load(modelURL,gltf=>{
  root=gltf.scene;
  root.traverse(o=>{ if(o.isSkinnedMesh&&o.skeleton)o.skeleton.pose(); });
  normalizeModel(root);

  let skinned=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(o.isSkinnedMesh)skinned++;
    o.material=new THREE.MeshBasicMaterial({
      color:0xe3e7e4,wireframe:true,transparent:true,opacity:.58,side:THREE.DoubleSide
    });
    o.frustumCulled=false;
  });

  anchor.add(root);
  captureBones();

  helper=new THREE.SkeletonHelper(root);
  helper.material.color.set(0xdf4936);
  helper.material.transparent=true;
  helper.material.opacity=.16;
  anchor.add(helper);

  makeHeadShell();
  const requestedPose=new URLSearchParams(location.search).get('pose');
  const initialPose=['stand','descent','seiza','hands','dogeza'].includes(requestedPose)?requestedPose:'stand';
  applyPose(initialPose);
  boneStatus.textContent += ' / SKIN '+skinned;

  loading.classList.add('hide');
  setTimeout(()=>loading.remove(),450);
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
  if(root)fitCamera(currentPose,updateBounds());
}
addEventListener('resize',resize);

function tick(){
  requestAnimationFrame(tick);
  syncHeadShell();
  controls.update();
  renderer.render(scene,camera);
}
tick();
