/**
 * Photorealistic spinning Earth (Three.js) with atmosphere + clouds.
 */
(function () {
  const mount = document.getElementById("globe-canvas");
  if (!mount || !window.THREE) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.15, 4.2);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // Soft starfield / deep space behind globe
  const starGeo = new THREE.BufferGeometry();
  const starCount = 400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 18;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    starPos[i * 3 + 2] = -4 - Math.random() * 8;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xb8c4d4, size: 0.012, transparent: true, opacity: 0.7 })
  );
  scene.add(stars);

  const ambient = new THREE.AmbientLight(0x334455, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d6, 2.15);
  sun.position.set(-4.5, 2.2, 3.5);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6aa8ff, 0.35);
  fill.position.set(3, -1, -2);
  scene.add(fill);

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  function prepTexture(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  const earthTex = prepTexture(loader.load("/assets/earth-day.jpg"));
  const cloudTex = prepTexture(loader.load("/assets/earth-clouds.png"));

  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTex,
    shininess: 12,
    specular: new THREE.Color(0x222222),
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
  earthGroup.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.015, 64, 64),
    new THREE.MeshPhongMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  earthGroup.add(clouds);

  // Atmosphere glow shell
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.08, 64, 64),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
          gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    })
  );
  earthGroup.add(atmosphere);

  // Outer halo ring for video-like rim light
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.14, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0x4da3ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  earthGroup.add(halo);

  earthGroup.rotation.x = 0.28;
  earthGroup.rotation.z = -0.12;

  function resize() {
    const w = mount.clientWidth || 300;
    const h = mount.clientHeight || 300;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener("resize", resize);

  let raf = 0;
  const clock = new THREE.Clock();

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getDelta();
    if (!reduceMotion) {
      earth.rotation.y += t * 0.12;
      clouds.rotation.y += t * 0.145;
      stars.rotation.y -= t * 0.01;
    }
    renderer.render(scene, camera);
  }
  frame();
})();
