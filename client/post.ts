// Post-processing w stylu "mrocznej ilustracji": tuszowe obrysy (krawędzie głębi),
// przygaszone kolory, sepia, winieta, ziarno papieru i zniekształcenia przy niskiej poczytalności.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 res;
uniform float cNear;
uniform float cFar;
uniform float time;
uniform float insanity;
uniform float inkStrength;
uniform float night;
varying vec2 vUv;

float linDepth(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * cNear * cFar) / (cFar + cNear - ndc * (cFar - cNear));
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main(){
  vec2 uv = vUv;
  // falowanie obrazu przy niskiej poczytalności
  if (insanity > 0.0) {
    uv.x += sin(uv.y * 18.0 + time * 1.7) * 0.004 * insanity;
    uv.y += cos(uv.x * 14.0 + time * 1.3) * 0.004 * insanity;
  }
  vec3 col = pow(texture2D(tColor, uv).rgb, vec3(1.0 / 2.2)); // tekstura sRGB jest dekodowana do liniowej przy odczycie
  float d = linDepth(uv);

  // --- tusz: Sobel na głębi, z grubością linii zależną od odległości ---
  vec2 px = (1.0 + 0.6 * vnoise(uv * res * 0.05)) / res; // lekko "drżąca" kreska
  float dl = linDepth(uv - vec2(px.x, 0.0));
  float dr = linDepth(uv + vec2(px.x, 0.0));
  float du = linDepth(uv + vec2(0.0, px.y));
  float dd = linDepth(uv - vec2(0.0, px.y));
  float dul = linDepth(uv + vec2(-px.x, px.y));
  float dur = linDepth(uv + vec2(px.x, px.y));
  float ddl = linDepth(uv + vec2(-px.x, -px.y));
  float ddr = linDepth(uv + vec2(px.x, -px.y));
  float gx = -dul - 2.0 * dl - ddl + dur + 2.0 * dr + ddr;
  float gy = -ddl - 2.0 * dd - ddr + dul + 2.0 * du + dur;
  float edge = sqrt(gx * gx + gy * gy) / max(d, 1.0);
  float ink = smoothstep(0.035, 0.09, edge) * inkStrength;
  ink *= 1.0 - smoothstep(90.0, 170.0, d); // daleko – bez kresek
  // zarys kolorowy (krawędzie jasności) dla detali
  vec3 cl = pow(texture2D(tColor, uv - vec2(px.x, 0.0)).rgb, vec3(1.0 / 2.2));
  vec3 cu = pow(texture2D(tColor, uv + vec2(0.0, px.y)).rgb, vec3(1.0 / 2.2));
  float lumEdge = length(col - cl) + length(col - cu);
  ink = max(ink, smoothstep(0.22, 0.45, lumEdge) * 0.45 * inkStrength * (1.0 - smoothstep(40.0, 90.0, d)));

  // --- kolor: przygaszony, cieplejszy, większy kontrast ---
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.62);                     // desaturacja
  col *= vec3(1.03, 0.98, 0.88);                       // sepia
  col = (col - 0.42) * 1.1 + 0.42;                     // kontrast
  col = max(col, 0.0);
  col = mix(col, col * vec3(0.75, 0.8, 1.15), night);  // chłodna noc

  // tusz
  col *= 1.0 - ink * 0.88;

  // papier: ziarno + plamy
  float paper = vnoise(gl_FragCoord.xy * 0.35) * 0.5 + vnoise(gl_FragCoord.xy * 0.03) * 0.5;
  col *= 0.9 + paper * 0.14;
  float grain = hash(gl_FragCoord.xy + fract(time) * 100.0);
  col += (grain - 0.5) * 0.03 * (0.4 + lum);

  // winieta
  vec2 v = vUv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(v * vec2(1.1, 1.0)));
  col *= mix(0.45, 1.0, vig);
  // szaleństwo: ciemne, fioletowe krawędzie
  col = mix(col, col * vec3(0.6, 0.35, 0.55), insanity * (1.0 - vig) * 0.9);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0); // wynik już w sRGB
}`;

export class Post {
  rt: THREE.WebGLRenderTarget;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mat: THREE.ShaderMaterial;
  enabled = true;

  constructor(public renderer: THREE.WebGLRenderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, depthTexture: depth, depthBuffer: true });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, res: { value: new THREE.Vector2(size.x, size.y) },
        cNear: { value: 0.5 }, cFar: { value: 400 }, time: { value: 0 }, insanity: { value: 0 }, inkStrength: { value: 1 }, night: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.mat.uniforms.res.value.set(size.x, size.y);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, t: number) {
    if (!this.enabled) { this.renderer.setRenderTarget(null); this.renderer.render(scene, camera); return; }
    const u = this.mat.uniforms;
    u.cNear.value = camera.near; u.cFar.value = camera.far; u.time.value = t;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}
