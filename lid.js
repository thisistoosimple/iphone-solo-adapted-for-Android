// Lid fold: hinge along the bottom edge
const LID = `
void main() {
  float turn = clamp(u_turn, 0.0, 1.0);
  if (turn <= 0.00001) {
    outColor = vec4(sampleImage(v_uv, 0.0), 1.0);
    return;
  }

  // Hinge projection
  float fromHinge = v_uv.y;
  float tilt = turn * HALF_PI;
  float bend = min(tilt, MAX_TILT);
  float cosine = cos(bend);
  float sine = sin(bend);

  float eye = 2.4;
  float depth = fromHinge * sine;
  float perspective = eye / (eye - depth);
  vec2 plane;
  plane.y = fromHinge * cosine * perspective;
  plane.x = 0.5 + (v_uv.x - 0.5) * perspective;

  // Defocus
  float blurAngle = pow(smoothstep(0.0, HALF_PI, tilt), 0.5);
  float blurSpread = pow(smoothstep(0.0, 0.7, fromHinge), 1.45);
  float defocus = blurAngle * mix(0.18, 1.0, blurSpread);
  float sigma = u_imageSize.y * BLUR * defocus;

  // Side margins
  float softness = fwidth(v_uv.x) + 2.0 * sigma / u_imageSize.x;
  float mask = 1.0 - smoothstep(0.5 - softness, 0.5 + softness, abs(plane.x - 0.5));

  // Glass
  vec3 color = sampleImage(plane, sigma);
  float glass = sine * pow(fromHinge, 1.6);
  color *= 1.0 - 0.2 * glass;
  float reflection = exp(-pow((fromHinge - 0.70) / 0.30, 2.0)) * sine;
  color += vec3(0.82, 0.85, 0.86) * reflection * 0.025;

  // Void
  float fade = clamp((fromHinge - 0.26) / 0.74, 0.0, 1.0);
  color *= 1.0 - 0.7 * blurAngle * fade;

  outColor = vec4(mix(DARK, color, mask), 1.0);
}`;

function createLid(canvas) {
  const stage = createStage(canvas, LID);
  if (!stage) return null;

  return {
    load: stage.load,
    draw: (turn) => stage.draw(turn),
  };
}
