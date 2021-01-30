import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js";
import { PMREMGenerator } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/src/extras/PMREMGenerator.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/RGBELoader.js';

const rotor_value_add = 40;
const rotorObjects = ["rotor1", "rotor2", "rotor3", "rotor4"];
let degree = 90;
let singleRotors = [];
let startPosition = null;
let lookAtTarget = null;
let startControl = 0;
let timeWait = 0;
let startSpeed = 0.005;
let rotationSpeed = 0.5;
const rotationMatrix = new THREE.Matrix4();
const targetQuaternion = new THREE.Quaternion();
let endQuaternion = null;
let backQuaternion = null;
let rotateNow = false;
var clock = new THREE.Clock();
let turnBackPending = false;
let step = 0;

class BasicCameraController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._accelerationTurn = new THREE.Vector3(1, 0.25, 200.0);
    this._decceleration = new THREE.Vector3(-0.0005, -5, -5.0);
    this._acceleration = new THREE.Vector3(1, 200.0, 200.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._position = new THREE.Vector3();

    this._animations = {};
    this._input = new BasicCameraControllerInput();
    
    this._LoadModels();
  }

  _LoadModels() {
    const loader = new GLTFLoader();
    loader.setPath('./resources/glb/');
    loader.load('drone.glb', (glb) => {
      glb.scene.scale.setScalar(2);
      glb.scene.traverse(c => {
      c.castShadow = true;
      });
      this._target = glb.scene;
      var singleRotor = null;
      for (var i = 0; i < rotorObjects.length; i++) {
        singleRotor = glb.scene.getObjectByName(rotorObjects[i]);
        if (singleRotor) {
          singleRotors.push(singleRotor);
          singleRotor = null;
        }
      }
      this._params.scene.add(this._target);
    });
  }

  get Position() {
    return this._position;
  }

  get Rotation() {
    if (!this._target) {
      return new THREE.Quaternion();
    }
    return this._target.quaternion;
  }

  Update(timeInSeconds) {
    if (!this._target) {
      return;
    }
    var delta = clock.getDelta();
    if (this._input._keys.space) {
      const viewRadiant = THREE.Math.degToRad(degree); 
      const viewAxis = new THREE.Vector3(0, 1, 0);
      const factorQuaternion = new THREE.Quaternion().setFromAxisAngle(viewAxis, viewRadiant);
      endQuaternion = new THREE.Quaternion();
      endQuaternion.multiplyQuaternions(this._target.quaternion, factorQuaternion);
      backQuaternion = this._target.quaternion.clone();
      rotateNow = true;
      turnBackPending = true;
    }
    if (startPosition && lookAtTarget) {
      var newX = lerp(this._target.position.x, startPosition.x, ease(startSpeed));   // interpolate between a and b where
      var newY = lerp(this._target.position.y, startPosition.y, ease(startSpeed));   // t is first passed through a easing
      var newZ = lerp(this._target.position.z, startPosition.z, ease(startSpeed));   // function in this example.
      this._target.position.set (newX, newY, newZ);
      rotationMatrix.lookAt(lookAtTarget, this._target.position, this._target.up );
      targetQuaternion.setFromRotationMatrix(rotationMatrix);
      this._target.quaternion.rotateTowards(targetQuaternion, startSpeed).normalize();
      startControl += startSpeed;
      if (startControl >= 1) {
        startPosition = null;
      }
    } else {
      if (rotateNow) {
        step = rotationSpeed * delta;
        this._target.quaternion.rotateTowards(endQuaternion, step);
        if (this._target.quaternion.equals(endQuaternion)) {
          if (turnBackPending) {
            timeWait += startSpeed;
            if (timeWait >= 0.5) {
              endQuaternion.copy(backQuaternion);
              turnBackPending = false;
              timeWait = 0;
            }
          } else {
            rotateNow = false;
          }
        }
      }
    }
    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
        velocity.x * this._decceleration.x,
        velocity.y * this._decceleration.y,
        velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
        Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._input._keys.shift) {
      acc.multiplyScalar(2.0);
    }

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }
    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    if (this._input._keys.down) {
      velocity.y -= acc.y * timeInSeconds;
    }
    if (this._input._keys.up) {
      velocity.y += acc.y * timeInSeconds;
    }
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 0.5 * Math.PI * timeInSeconds * this._accelerationTurn.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 0.5 * -Math.PI * timeInSeconds * this._accelerationTurn.y);
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const upward = new THREE.Vector3(0, 1, 0);
    upward.applyQuaternion(controlObject.quaternion);
    upward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    forward.multiplyScalar(velocity.z * timeInSeconds);
    upward.multiplyScalar(velocity.y * timeInSeconds);
    sideways.multiplyScalar(velocity.x * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(upward);
    controlObject.position.add(sideways);

    this._position.copy(controlObject.position);
  }
};

class BasicCameraControllerInput {
  constructor() {
    this._Init();    
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      space: false,
      shift: false,
      
    };
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
    case 87: // w
        this._keys.forward = true;
        break;
    case 65: // a
        this._keys.left = true;
        break;
    case 83: // s
        this._keys.backward = true;
        break;
    case 68: // d
        this._keys.right = true;
        break;
    case 38: // up arrow
        this._keys.forward = true;
        break;
    case 37: // left arrow
        this._keys.left = true;
        break;
    case 40: // down arrow
        this._keys.backward = true;
        break;
    case 39: // right arrow
        this._keys.right = true;
        break;
    case 82: // r 
        this._keys.up = true;
        break;
    case 70: // f
        this._keys.down = true;
        break;
    case 33: // page up
        this._keys.up = true;
        break;
    case 34: // page down
        this._keys.down = true;
        break;
    case 32: // SPACE
        this._keys.space = true;
        break;
    case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
    case 87: // w
        this._keys.forward = false;
        break;
    case 65: // a
        this._keys.left = false;
        break;
    case 83: // s
        this._keys.backward = false;
        break;
    case 68: // d
        this._keys.right = false;
        break;
    case 38: // up arrow
        this._keys.forward = false;
        break;
    case 37: // left arrow
        this._keys.left = false;
        break;
    case 40: // down arrow
        this._keys.backward = false;
        break;
    case 39: // right arrow
        this._keys.right = false;
        break;
        case 82: // r 
        this._keys.up = false;
        break;
    case 70: // f
        this._keys.down = false;
        break;
    case 33: // page up
        this._keys.up = false;
        break;
    case 34: // page down
        this._keys.down = false;
        break;
    case 32: // SPACE
        this._keys.space = false;
        break;
    case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};

class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 20, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(0, 10, 50);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}


class ThirdPersonCameraDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);
    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);

    this._scene = new THREE.Scene();

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(-100, 100, 100);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 4096;
    light.shadow.mapSize.height = 4096;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 50;
    light.shadow.camera.right = -50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 0.25);
    this._scene.add(light);
    this._threejs.toneMapping = "Linear";
    this._threejs.toneMappingExposure = 0.5;
    const pmremGenerator = new PMREMGenerator( this._threejs );
    pmremGenerator.compileEquirectangularShader();
    var loader = new RGBELoader(this._manager);
    var file_name_hdr = './resources/hdri/sunflowers_2k.hdr';   
    loader.load(file_name_hdr, hdri => {
      const envMap = pmremGenerator.fromEquirectangular( hdri ).texture;
      this._scene.background = envMap;
      hdri.dispose();
      pmremGenerator.dispose();
    },
    function (hdr) {
        console.log ( hdr.loaded / hdr.total * 100  + "% of object loaded");
    });
    loader = new GLTFLoader();
    loader.setPath('./resources/glb/');
    loader.load('black_forrest.glb', (glb) => {
    glb.scene.scale.setScalar(0.1);
    glb.scene.traverse(c => {
    c.castShadow = true;
    });
    this._target = glb.scene;
    this._scene.add(this._target);
    const startObject = this._scene.getObjectByName( 'start' );
    const lookAtTargetObject = this._scene.getObjectByName( 'lookAtTarget' );
    startPosition = new THREE.Vector3(startObject.position.x, startObject.position.y, startObject.position.z);
    lookAtTarget = new THREE.Vector3(lookAtTargetObject.position.x, lookAtTargetObject.position.y, lookAtTargetObject.position.z);
    
  });
    this._previousRAF = null;

    this._LoadAnimatedModel();
    this._RAF();
  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene,
    }
    this._controls = new BasicCameraController(params);

    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
      target: this._controls,
    });
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    for (var i = 0; i < singleRotors.length; i++) {
        singleRotors[i].rotation.y += rotor_value_add;
    }
    if (this._controls) {
      this._controls.Update(timeElapsedS);
    }

    this._thirdPersonCamera.Update(timeElapsedS);
  }
}

let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new ThirdPersonCameraDemo();
});

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