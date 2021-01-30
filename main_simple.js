import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js";
import { PMREMGenerator } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/src/extras/PMREMGenerator.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/RGBELoader.js';
import { TrackballControls } from "https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/controls/TrackballControls.js";
var renderer, scene, camera, camControls;
var clock = new THREE.Clock();
const rotor_value_add = 40;
const rotorObjects = ["rotor1", "rotor2", "rotor3", "rotor4"];
let singleRotors = [];
let keys = {
  space: false,
};
let startSpeed = 0.005;
let rotationSpeed = 0.5;
let degree = 90;
let startControl = 0;
let timeControl = 0;
let timeWait = 0;
let endQuaternion = null;
let backQuaternion = null;
let rotateNow = false;
let turnBackPending = false;
let flyingObject = null;
let step = 0;

let startPosition = null;
let lookAtTarget = null;
const rotationMatrix = new THREE.Matrix4();
const targetQuaternion = new THREE.Quaternion();

init();
animate();

function init() {
  

  // renderer
  renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // scene
  scene = new THREE.Scene();

  // ambient light
  var ambient = new THREE.AmbientLight(0x404040, 1.5);
  scene.add(ambient);

  // directional light
  var directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(-1, 1, 1);
  scene.add(directionalLight);

  // camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(-100, 100, 200);
  camera.up.set(0, 1, 0);
  
  camControls = new TrackballControls( camera, renderer.domElement );
  camControls.autoForward = false;
  camControls.noFly = true;
  camControls.lookVertical = true;
  camControls.constrainVertical = true;
  camControls.verticalMin = 1.0;
  camControls.verticalMax = 2.0;
  camControls.lon = 0;
  camControls.lat = 0;
  // rest
  renderer.toneMappingExposure = 0.7;
  const pmremGenerator = new PMREMGenerator( renderer );
  pmremGenerator.compileEquirectangularShader();
  var loader = new RGBELoader();
  var file_name_hdr = './resources/hdri/sunflowers_2k.hdr';   
  loader.load(file_name_hdr, hdri => {
    const envMap = pmremGenerator.fromEquirectangular( hdri ).texture;
    scene.background = envMap;
    hdri.dispose();
    pmremGenerator.dispose();
  },
  function (hdr) {
      console.log ( hdr.loaded / hdr.total * 100  + "% of object loaded");
  });
  loader = new GLTFLoader();
  loader.setPath('./resources/glb/');
  loader.load('black_forrest.glb', (glb) => {
    glb.scene.scale.setScalar(1);
    glb.scene.traverse(c => {
    c.castShadow = true;
    });
    const startObject = glb.scene.getObjectByName( 'start' );
    const lookAtTargetObject = glb.scene.getObjectByName( 'lookAtTarget' );
    startPosition = new THREE.Vector3(startObject.position.x, startObject.position.y, startObject.position.z);
    lookAtTarget = new THREE.Vector3(lookAtTargetObject.position.x, lookAtTargetObject.position.y, lookAtTargetObject.position.z);
    scene.add(glb.scene);
  });
  loader.load('drone.glb', (glb) => {
    glb.scene.scale.setScalar(40);
    glb.scene.traverse(c => {
    c.castShadow = true;
    });
    var singleRotor = null;
    for (var i = 0; i < rotorObjects.length; i++) {
      singleRotor = glb.scene.getObjectByName(rotorObjects[i]);
      if (singleRotor) {
        singleRotors.push(singleRotor);
        singleRotor = null;
      }
    }
    flyingObject = glb.scene;
    scene.add(glb.scene);
  });
  document.addEventListener('keydown', (e) => onKeyDown(e), false);
  document.addEventListener('keyup', (e) => onKeyUp(e), false);
}

// render
function render() {
  if (!flyingObject) {
    return;
  }
  var delta = clock.getDelta();
  if (keys.space) {
    if (!rotateNow && !startPosition) {
      const viewRadiant = THREE.Math.degToRad(degree); 
      const viewAxis = new THREE.Vector3(0, 1, 0);
      const factorQuaternion = new THREE.Quaternion().setFromAxisAngle(viewAxis, viewRadiant);
      endQuaternion = new THREE.Quaternion();
      endQuaternion.multiplyQuaternions(flyingObject.quaternion, factorQuaternion);
      backQuaternion = flyingObject.quaternion.clone();
      rotateNow = true;
      turnBackPending = true;
      timeControl = 0;
      document.getElementById("infotext").style.display = "none";
    }
  }
  if (startPosition && lookAtTarget) {
    var newX = lerp(flyingObject.position.x, startPosition.x, ease(startSpeed));   // interpolate between a and b where
    var newY = lerp(flyingObject.position.y, startPosition.y, ease(startSpeed));   // t is first passed through a easing
    var newZ = lerp(flyingObject.position.z, startPosition.z, ease(startSpeed));   // function in this example.
    flyingObject.position.set (newX, newY, newZ);
    rotationMatrix.lookAt(lookAtTarget, flyingObject.position, flyingObject.up );
    targetQuaternion.setFromRotationMatrix(rotationMatrix);
    flyingObject.quaternion.rotateTowards(targetQuaternion, startSpeed).normalize();
    startControl += startSpeed;
    if (startControl >= 1) {
      startPosition = null;
      document.getElementById("infotext").style.display = "block";
    }
  } else {
    if (rotateNow) {
      step = rotationSpeed * delta;
      flyingObject.quaternion.rotateTowards(endQuaternion, step);
      if (flyingObject.quaternion.equals(endQuaternion)) {
        if (turnBackPending) {
          timeWait += startSpeed;
          if (timeWait >= 0.5) {
            endQuaternion.copy(backQuaternion);
            turnBackPending = false;
            timeWait = 0;
          }
        } else {
          document.getElementById("infotext").style.display = "block";
          rotateNow = false;
        }
      }

      // Alternative ==> not fully turning back (that's probably the price of slerping)
      /** 
      step = rotationSpeed * delta;
      timeControl += step;
      // console.log ("Time control: " + timeControl);
      THREE.Quaternion.slerp(flyingObject.quaternion, endQuaternion, flyingObject.quaternion, step).normalize();
      if (timeControl >= 1) {      // no other way found to somehow know, when the slerp has finished
        if (turnBackPending) {
          timeWait += startSpeed;
          if (timeWait >= 0.5) {
            endQuaternion.copy(backQuaternion);
            turnBackPending = false;
            timeWait = 0;
            timeControl = 0;
          }
        } else {
          document.getElementById("infotext").style.display = "block";
          rotateNow = false;
          timeControl = 0;
        }
      }
      **/     
      // End Alternative
    }
  }
  for (var i = 0; i < singleRotors.length; i++) {
    singleRotors[i].rotation.y += rotor_value_add;
  }

  camControls.update(delta);
  renderer.render(scene, camera);
}

// animate
function animate() {
  requestAnimationFrame(animate);
  render();
}

function onKeyDown(event) {
  switch(event.keyCode) {
    case 32: // SPACE
    keys.space = true;
    break;
  }
}
function onKeyUp(event) {
  switch(event.keyCode) {
    case 32: // SPACE
    keys.space = false;
    break;
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function ease(t) { 
  var tt = t;
  if (t<0.5) {
    tt = 2*t*t;
  } else {
    tt = -1+(4-2*t)*t;
  }
  return tt;
}