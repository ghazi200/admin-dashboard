/**
 * Photorealistic spinning Earth (Three.js) with atmosphere + clouds.
 */
(function () {
  const mount = document.getElementById("globe-canvas");
  if (!mount || !window.THREE) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0.08, 3.05);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const earthGroup = new THREE.Group();
  earthGroup.rotation.z = -0.15;
  earthGroup.rotation.x = 0.22;
  scene.add(earthGroup);

  scene.add(new THREE.AmbientLight(0x8aa4c8, 0.75));

  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(-3.8, 2.4, 2.8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x6ea8ff, 0.45);
  fill.position.set(3.2, -0.6, -1.5);
  scene.add(fill);

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  function prep(tex) {
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.needsUpdate = true;
    return tex;
  }

  function resize() {
    const w = mount.clientWidth || 300;
    const h = mount.clientHeight || 300;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener("resize", resize);

  let earth;
  let clouds;
  let ready = false;

  loader.load("/assets/earth-day.jpg", (dayTex) => {
    prep(dayTex);

    earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({
        map: dayTex,
        roughness: 0.82,
        metalness: 0.05,
      })
    );
    earthGroup.add(earth);

    // Atmosphere rim glow (fresnel)
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorldPos = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4);
            vec3 color = vec3(0.35, 0.7, 1.0);
            gl_FragColor = vec4(color, 1.0) * fresnel * 1.35;
          }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      })
    );
    earthGroup.add(atmosphere);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ff,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    earthGroup.add(halo);

    loader.load("/assets/earth-clouds.png", (cloudTex) => {
      prep(cloudTex);
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.018, 64, 64),
        new THREE.MeshStandardMaterial({
          map: cloudTex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          roughness: 1,
          metalness: 0,
        })
      );
      earthGroup.add(clouds);
      ready = true;
    }, undefined, () => {
      ready = true;
    });

    ready = true;
  });

  let raf = 0;
  const clock = new THREE.Clock();

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getDelta();
    if (ready && !reduceMotion) {
      if (earth) earth.rotation.y += t * 0.13;
      if (clouds) clouds.rotation.y += t * 0.155;
    }
    renderer.render(scene, camera);
  }
  frame();
})();
