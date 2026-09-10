// Book fold: hinge on the left or right edge
const FOLD = `
uniform float u_hinge;

void main() {
  float turn = clamp(u_turn, 0.0, 1.0);
  if (turn <= 0.00001) {
    outColor = vec4(sampleImage(v_uv, 0.0), 1.0);
    return;
  }

  // Hinge projection
  float outer = 1.0 - u_hinge;
  float fromHinge = abs(v_uv.x - u_hinge);
  float tilt = turn * HALF_PI;
  float bend = min(tilt, MAX_TILT);
  float cosine = cos(bend);
  float sine = sin(bend);

  float eye = 2.4 * max(u_aspect, 1.0);
  float depth = fromHinge * u_aspect * sine;
  float perspective = eye / (eye - depth);
  vec2 plane;
  plane.x = u_hinge + (v_uv.x - u_hinge) * cosine * perspective;
  plane.y = 0.5 + (v_uv.y - 0.5) * perspective;

  // Defocus
  float blurAngle = pow(smoothstep(0.0, HALF_PI, tilt), 0.5);
  float blurSpread = pow(smoothstep(0.0, 0.7, fromHinge), 1.45);
  float defocus = blurAngle * mix(0.18, 1.0, blurSpread);
  float sigma = u_imageSize.x * BLUR * defocus;

  // Vertical margins
  float softness = fwidth(v_uv.y) + 2.0 * sigma / u_imageSize.y;
  float mask = 1.0 - smoothstep(0.5 - softness, 0.5 + softness, abs(plane.y - 0.5));

  // Glass
  vec3 color = sampleImage(plane, sigma);
  float glass = sine * pow(fromHinge, 1.6);
  color *= 1.0 - mix(0.28, 0.06, outer) * glass;
  float reflection = exp(-pow((fromHinge - 0.70) / 0.30, 2.0)) * sine;
  color += vec3(0.82, 0.85, 0.86) * reflection * 0.025;

  // Void
  float fade = clamp((fromHinge - 0.26) / 0.74, 0.0, 1.0);
  color *= 1.0 - 0.7 * blurAngle * fade;

  outColor = vec4(mix(DARK, color, mask), 1.0);
}`;

function createFold(canvas) {
  const stage = createStage(canvas, FOLD, ['u_hinge']);
  if (!stage) return null;

  return {
    load: stage.load,
    draw(turn, hinge) {
      stage.draw(turn, (gl, u) => gl.uniform1f(u.u_hinge, hinge));
    },
  };
}
